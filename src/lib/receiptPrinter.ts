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

export const defaultCompanyInfo: CompanyInfo = {
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
// COMPACT THERMAL CUSTOMER RECEIPT & BILL GENERATOR
// Lightweight, concise height, thin ultra-dashed dividers, zero thick black banners
// Crisp normal font weights, fully responsive for 80mm & 58mm thermal printers
// Fully honors the showTaxInfo toggle (show/hide Kenya tax breakdown)
// =========================================================================

export async function generateCustomerBillHTML(
  data: ReceiptData,
  company: CompanyInfo = defaultCompanyInfo,
  isPaid: boolean = false
): Promise<string> {
  const showTax = data.showTaxInfo ?? getTaxDisplaySettingSync();

  let qrDataUrl = '';
  if (data.qrCodeData) {
    try {
      qrDataUrl = await QRCode.toDataURL(data.qrCodeData, {
        errorCorrectionLevel: 'M', margin: 1, width: 280,
        color: { dark: '#000000', light: '#ffffff' }
      });
    } catch (e) { console.error('QR error', e); }
  }

  const fmt = (n: number | undefined | null) =>
    (Number(n) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const totalQty = data.items.reduce((s, i) => s + (i.qty || 1), 0);
  const netAmt  = data.netAmount  || (data.total / 1.18);
  const vatAmt  = data.vatAmount  || (netAmt * ((data.vatRate  || 16) / 100));
  const levyAmt = data.levyAmount || (netAmt * ((data.levyRate || 2)  / 100));
  const totTax  = data.totalTax   || (vatAmt + levyAmt);

  const cols = showTax ? 5 : 4;
  const itemRows = data.items.map(item => {
    const disc = item.discount && item.discount > 0;
    const taxAmt = (item.total - (item.discount || 0)) - ((item.total - (item.discount || 0)) / 1.18);
    let row = showTax
      ? `<tr>
          <td class="i-name">${item.name}${item.notes ? '<br><span class="i-note">↳ ' + item.notes + '</span>' : ''}${disc ? '<br><span class="i-disc">– disc ' + fmt(item.discount) + '</span>' : ''}</td>
          <td class="i-qty">${item.qty}</td>
          <td class="i-price">${item.price.toLocaleString()}</td>
          <td class="i-tax">${Math.round(taxAmt).toLocaleString()}</td>
          <td class="i-amt">${(item.total - (item.discount || 0)).toLocaleString()}</td>
        </tr>`
      : `<tr>
          <td class="i-name">${item.name}${item.notes ? '<br><span class="i-note">↳ ' + item.notes + '</span>' : ''}${disc ? '<br><span class="i-disc">– disc ' + fmt(item.discount) + '</span>' : ''}</td>
          <td class="i-qty">${item.qty}</td>
          <td class="i-price">${item.price.toLocaleString()}</td>
          <td class="i-amt">${(item.total - (item.discount || 0)).toLocaleString()}</td>
        </tr>`;
    return row;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${data.invoiceNo}</title>
<style>
@page { margin:0; size:80mm auto; }
*{ margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body{
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  font-size: 10.5px; font-weight: 400;
  width: 76mm; max-width: 76mm;
  padding: 3mm 2.5mm; margin: 0 auto;
  background: #fff; color: #000; line-height: 1.35;
}
/* ─── HEADER ─── */
.h-name { font-size:15px; font-weight:700; text-transform:uppercase; letter-spacing:.8px; text-align:center; }
.h-stars{ font-size:9.5px; letter-spacing:4px; text-align:center; margin:2px 0; }
.h-tag  { font-size:8.5px; font-weight:600; letter-spacing:1.5px; text-transform:uppercase; text-align:center; margin-bottom:2px; }
.h-info { font-size:9.5px; text-align:center; line-height:1.4; }
/* ─── DIVIDERS ─── */
.ln-solid{ border-top:1px dashed #000; margin:4px 0; }
.ln-dash { border-top:1px dashed #888; margin:3px 0; }
/* ─── DOC TITLE ─── */
.doc-title{ font-size:11.5px; font-weight:700; letter-spacing:.5px; text-transform:uppercase; text-align:center; padding:3px 0; }
/* ─── META GRID ─── */
.meta{ display:grid; grid-template-columns:1fr 1fr; gap:1.5px 4px; font-size:9.5px; margin:3px 0; }
.meta .lbl{ color:#444; }
.meta .val{ font-weight:600; }
/* ─── ITEMS TABLE ─── */
table{ width:100%; border-collapse:collapse; margin:3px 0; }
thead th{
  font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.3px;
  border-top:1px dashed #000; border-bottom:1px dashed #000;
  padding:3px 1px;
}
.i-name{ font-size:10.5px; font-weight:500; padding:3px 1px; max-width:42%; }
.i-note{ font-size:9px; color:#555; font-style:italic; display:block; }
.i-disc{ font-size:9px; color:#333; display:block; }
.i-qty,.i-price,.i-tax,.i-amt{ font-size:10.5px; padding:3px 1px; vertical-align:top; }
.i-qty{ text-align:center; }
.i-price,.i-tax,.i-amt{ text-align:right; }
.i-amt{ font-weight:600; }
.i-tax{ font-size:9.5px; }
tr.item-row{ border-bottom:1px dashed #ddd; }
/* ─── TOTALS ─── */
.tot-row{ display:flex; justify-content:space-between; font-size:10px; padding:1.5px 0; }
.tot-row.disc{ color:#333; }
/* ─── GRAND TOTAL ─── */
.grand{ text-align:center; padding:5px 4px; border-top:1.5px dashed #000; border-bottom:1.5px dashed #000; margin:4px 0; }
.grand-lbl{ font-size:9px; font-weight:600; letter-spacing:1px; text-transform:uppercase; }
.grand-amt{ font-size:18px; font-weight:700; letter-spacing:.5px; }
/* ─── TAX BOX ─── */
.tax-box{ font-size:9.5px; padding:3px 4px; border:1px dashed #888; margin:3px 0; }
.tax-hd { font-size:8.5px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; text-align:center; margin-bottom:2px; }
.tax-row{ display:flex; justify-content:space-between; padding:.8px 0; }
/* ─── PAYMENT ─── */
.pay-row{ display:flex; justify-content:space-between; font-size:10px; padding:1.5px 0; }
.pay-row .v{ font-weight:600; }
.mpesa{ font-size:9px; font-weight:600; letter-spacing:.5px; margin-top:1px; }
/* ─── STATUS STRIP ─── */
.status{ text-align:center; font-size:10px; font-weight:600; letter-spacing:.5px; text-transform:uppercase; padding:3px 0; border-top:1px dashed #666; border-bottom:1px dashed #666; margin:4px 0; }
/* ─── QR SECTION ─── */
.qr-wrap{ text-align:center; margin:4px 0; }
.qr-lbl { font-size:9.5px; font-weight:700; letter-spacing:.5px; text-transform:uppercase; border-top:1px dashed #000; border-bottom:1px dashed #000; padding:2px 0; margin-bottom:3px; }
.qr-sub { font-size:8px; color:#555; margin-bottom:3px; }
.qr-wrap img{ width:100px; height:100px; display:block; margin:0 auto; }
/* ─── FOOTER ─── */
.footer{ text-align:center; margin-top:5px; border-top:1px dashed #000; padding-top:4px; }
.footer-ty{ font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; }
.footer-sl{ font-size:9px; font-style:italic; margin:1.5px 0; }
.footer-pl{ font-size:8.5px; color:#444; }
.footer-bm{ font-size:8px; font-weight:600; letter-spacing:.5px; text-transform:uppercase; color:#666; margin-top:3px; }
@media print{ body{ padding:1.5mm 2mm; } }
</style>
</head>
<body>

<div class="h-name">${company.name}</div>
<div class="h-stars">★ ★ ★ ★ ★</div>
<div class="h-tag">Fine Dining &amp; Hospitality</div>
<div class="h-info">
  ${company.address ? company.address + '<br>' : ''}
  Tel: ${company.phone}${showTax && company.pin ? ' | PIN: ' + company.pin : ''}
</div>

<div class="ln-solid"></div>
<div class="doc-title">${isPaid ? (showTax ? '✦ Tax Invoice ✦' : '✦ Official Receipt ✦') : '✦ Guest Bill ✦'}</div>
<div class="ln-solid"></div>

<div class="meta">
  <div><span class="lbl">Bill No </span><span class="val">${data.invoiceNo}</span></div>
  <div><span class="lbl">Date </span><span class="val">${data.date}</span></div>
  <div><span class="lbl">Table </span><span class="val">${data.tableNo ? 'Table ' + data.tableNo : 'Counter'}</span></div>
  <div><span class="lbl">Time </span><span class="val">${data.time}</span></div>
  <div><span class="lbl">Server </span><span class="val">${data.cashier}</span></div>
  <div><span class="lbl">Payment </span><span class="val">${data.paymentMethod.toUpperCase()}</span></div>
  ${data.customerName ? `<div style="grid-column:1/-1;"><span class="lbl">Guest </span><span class="val">${data.customerName}</span></div>` : ''}
</div>

<div class="ln-dash"></div>

<table>
  <thead>
    ${showTax ? `<tr>
      <th style="width:42%;text-align:left;">Description</th>
      <th style="width:10%;text-align:center;">Qty</th>
      <th style="width:17%;text-align:right;">Price</th>
      <th style="width:12%;text-align:right;">Tax</th>
      <th style="width:19%;text-align:right;">Amount</th>
    </tr>` : `<tr>
      <th style="width:50%;text-align:left;">Description</th>
      <th style="width:12%;text-align:center;">Qty</th>
      <th style="width:19%;text-align:right;">Price</th>
      <th style="width:19%;text-align:right;">Amount</th>
    </tr>`}
  </thead>
  <tbody>${itemRows}</tbody>
</table>

<div class="ln-dash"></div>
<div class="tot-row"><span>Subtotal (${data.items.length} items, ${totalQty} pcs)</span><span>Ksh ${data.subtotal.toLocaleString()}</span></div>
${data.discount > 0 ? `<div class="tot-row disc"><span>Discount</span><span>– Ksh ${data.discount.toLocaleString()}</span></div>` : ''}

${showTax ? `
<div class="tax-box">
  <div class="tax-hd">Kenya Tax Summary (18% Inclusive)</div>
  <div class="tax-row"><span>Net Amount</span><span>Ksh ${fmt(netAmt)}</span></div>
  <div class="tax-row"><span>VAT 16%</span><span>Ksh ${fmt(vatAmt)}</span></div>
  <div class="tax-row"><span>Catering Levy 2%</span><span>Ksh ${fmt(levyAmt)}</span></div>
  <div class="tax-row" style="border-top:1px dashed #999;margin-top:1px;padding-top:1px;font-weight:600;">
    <span>Total Tax</span><span>Ksh ${fmt(totTax)}</span>
  </div>
</div>` : ''}

<div class="grand">
  <div class="grand-lbl">${isPaid ? 'Total Paid' : 'Total Due'}</div>
  <div class="grand-amt">Ksh ${data.total.toLocaleString()}</div>
</div>

${isPaid ? `
<div class="ln-dash"></div>
<div class="pay-row"><span>Method</span><span class="v">${data.paymentMethod.toUpperCase()}</span></div>
<div class="pay-row"><span>Tendered</span><span class="v">Ksh ${(data.amountPaid || data.total).toLocaleString()}</span></div>
${data.change > 0 ? `<div class="pay-row"><span>Change</span><span class="v">Ksh ${data.change.toLocaleString()}</span></div>` : ''}
${(data.paymentMethod.toUpperCase().includes('MPESA') || data.mpesaReceipt)
  ? `<div class="mpesa">M-Pesa Ref: ${data.mpesaReceipt || 'CONFIRMED'}</div>` : ''}
` : ''}

${(data.qrCodeData && qrDataUrl) ? `
<div class="qr-wrap">
  <div class="qr-lbl">📱 Scan QR · Pay Instantly</div>
  <div class="qr-sub">M-Pesa · Visa · Mobile Money</div>
  <img src="${qrDataUrl}" alt="Scan to Pay" />
</div>` : ''}

${data.orderNotes ? `<div style="font-size:9.5px;font-style:italic;margin:2px 0;">Note: ${data.orderNotes}</div>` : ''}

<div class="footer">
  <div class="footer-ty">Thank You for Dining With Us</div>
  <div class="footer-sl">${company.slogan || 'Excellence in Food & Hospitality'}</div>
  <div class="footer-pl">Goods once sold are not returnable · Receipt valid for tax compliance</div>
  <div class="footer-bm">AlphaPlus POS · Enterprise Hotel Systems</div>
</div>

</body></html>
`;
}

// Generate thermal receipt HTML (for paid receipts)
export async function generateReceiptHTML(data: ReceiptData, company: CompanyInfo = defaultCompanyInfo): Promise<string> {
  return generateCustomerBillHTML(data, company, true);
}

// Generate KOT (Kitchen Order Ticket) HTML
// Large bold fonts, high contrast for fast line cook viewing
export function generateKOTHTML(data: KOTData, company: CompanyInfo = defaultCompanyInfo): string {
  const itemRows = data.items.map((item, index) => `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:3.5px 0;border-bottom:1px dashed #cccccc;">
      <span style="font-size:17px;font-weight:800;max-width:76%;word-break:break-word;color:#000;">${index + 1}. ${item.name}</span>
      <span style="font-size:20px;font-weight:900;min-width:44px;text-align:right;color:#000;">[ ${item.qty} ]</span>
    </div>
    ${item.notes ? `
    <div style="font-size:13.5px;color:#000;font-weight:700;font-style:italic;padding-left:10px;margin:2px 0 3px 0;">
      👉 ${item.notes}
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
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 15px;
      width: 76mm;
      max-width: 76mm;
      padding: 2mm 1.5mm;
      margin: 0 auto;
      background: #ffffff;
      color: #000000;
      line-height: 1.35;
      font-weight: 600;
    }
    .thin-dash {
      border-top: 1.5px dashed #000000;
      margin: 4px 0;
      width: 100%;
    }
    .title-strip {
      border-top: 2px dashed #000000;
      border-bottom: 2px dashed #000000;
      padding: 5px 0;
      text-align: center;
      font-size: 20px;
      font-weight: 900;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      margin: 4px 0;
      color: #000000;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      font-size: 14.5px;
      font-weight: 700;
      color: #000000;
      padding: 1.5px 0;
    }
    .items-container {
      margin: 5px 0;
    }
    .notes-box {
      border: 1.5px dashed #000000;
      padding: 4px 6px;
      margin: 5px 0;
      font-size: 13.5px;
      font-weight: 700;
      text-align: center;
      font-style: italic;
      color: #000000;
    }
    .footer-note {
      text-align: center;
      font-size: 12px;
      font-weight: 700;
      color: #000000;
      margin-top: 5px;
      line-height: 1.3;
    }
    @media print {
      body {
        width: 76mm;
        max-width: 76mm;
        padding: 1mm 1.5mm;
      }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div style="text-align:center;margin-bottom:3px;">
    <div style="font-size:14px;font-weight:800;text-transform:uppercase;color:#000;">${company.name}</div>
  </div>

  <!-- Document Title Strip -->
  <div class="title-strip">
    KITCHEN ORDER TICKET #${data.kotNo}
    ${data.priority === 'rush' ? '<br><span style="color:#000;font-size:18px;">*** RUSH ORDER ***</span>' : ''}
  </div>

  <!-- Metadata -->
  <div class="info-row">
    <span>Order: ${data.orderType.toUpperCase()}</span>
    ${data.tableNo ? `<span style="font-size:16px;font-weight:900;">TABLE: ${data.tableNo}</span>` : ''}
  </div>
  <div class="info-row">
    <span>Server: ${data.waiter || 'Server'}</span>
    <span>${data.date} ${data.time}</span>
  </div>

  <div class="thin-dash"></div>

  <!-- Items List -->
  <div class="items-container">
    <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:800;color:#000;border-bottom:1.5px dashed #000;padding-bottom:2px;margin-bottom:3px;text-transform:uppercase;">
      <span>Item Description</span>
      <span>Qty</span>
    </div>
    ${itemRows}
  </div>

  ${data.orderNotes ? `
  <div class="notes-box">
    Note: ${data.orderNotes}
  </div>
  ` : ''}

  <div class="thin-dash"></div>

  <!-- Footer -->
  <div class="footer-note">
    <div>*** KITCHEN EXPEDITE COPY ***</div>
    <div>Alpha Plus POS • ${data.date} ${data.time}</div>
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
