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

  // Generate inline QR code as base64 (compact size ~85px)
  let qrDataUrl = '';
  if (data.qrCodeData) {
    try {
      qrDataUrl = await QRCode.toDataURL(data.qrCodeData, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 140,
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

  // Generate item rows (compact, thin dashed borders, normal weight)
  const itemRows = data.items.map((item) => {
    const itemSubtotal = item.total - (item.discount || 0);
    const itemTaxRate = 0.18; // 16% VAT + 2% Levy
    const itemNetAmount = itemSubtotal / (1 + itemTaxRate);
    const itemTaxAmount = itemSubtotal - itemNetAmount;

    const itemNotes = item.notes
      ? `<div style="font-size:7.5px;color:#555;font-style:italic;">* ${item.notes}</div>`
      : '';
    const itemDiscount = item.discount && item.discount > 0
      ? `<div style="font-size:7.5px;color:#333;">-${fmt(item.discount)} disc</div>`
      : '';

    if (showTax) {
      return `
        <tr>
          <td style="padding:2px 1px;vertical-align:top;">
            <div>${item.name}</div>
            ${itemNotes}
            ${itemDiscount}
          </td>
          <td style="padding:2px 1px;text-align:center;vertical-align:top;">${item.qty}</td>
          <td style="padding:2px 1px;text-align:right;vertical-align:top;">${item.price.toLocaleString()}</td>
          <td style="padding:2px 1px;text-align:right;font-size:8px;vertical-align:top;">${Math.round(itemTaxAmount).toLocaleString()}</td>
          <td style="padding:2px 1px;text-align:right;vertical-align:top;">${item.total.toLocaleString()}</td>
        </tr>
      `;
    } else {
      // Clean 4-column layout when tax is hidden
      return `
        <tr>
          <td style="padding:2px 1px;vertical-align:top;">
            <div>${item.name}</div>
            ${itemNotes}
            ${itemDiscount}
          </td>
          <td style="padding:2px 1px;text-align:center;vertical-align:top;">${item.qty}</td>
          <td style="padding:2px 1px;text-align:right;vertical-align:top;">${item.price.toLocaleString()}</td>
          <td style="padding:2px 1px;text-align:right;vertical-align:top;">${item.total.toLocaleString()}</td>
        </tr>
      `;
    }
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${isPaid ? 'Receipt' : 'Bill'} - ${data.invoiceNo}</title>
  <style>
    @page {
      margin: 0;
      size: 80mm auto;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      font-weight: normal !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 9.5px;
      width: 80mm;
      max-width: 80mm;
      padding: 2.5mm 3mm;
      margin: 0 auto;
      background: #ffffff;
      color: #000000;
      line-height: 1.3;
    }

    /* ── Thin Ultra Dashes ── */
    .thin-dash {
      border-top: 1px dashed #555555;
      margin: 3px 0;
      width: 100%;
    }

    /* ── Header Section ── */
    .header-area {
      text-align: center;
      margin-bottom: 3px;
    }
    .comp-name {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .comp-details {
      font-size: 8.5px;
      color: #222222;
      line-height: 1.3;
      margin-top: 1px;
    }

    /* ── Title Banner with Thin Dashes ── */
    .title-strip {
      border-top: 1px dashed #555555;
      border-bottom: 1px dashed #555555;
      padding: 2.5px 0;
      text-align: center;
      font-size: 10px;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      margin: 3px 0;
    }

    /* ── Metadata Info ── */
    .info-grid {
      font-size: 8.5px;
      margin: 3px 0;
      line-height: 1.35;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 0.5px 0;
    }

    /* ── Items Table ── */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 3px 0;
      font-size: 9px;
    }
    .items-table th {
      border-top: 1px dashed #555555;
      border-bottom: 1px dashed #555555;
      padding: 3px 1px;
      font-size: 8.5px;
      text-transform: uppercase;
      background: transparent !important;
      color: #000000;
    }
    .items-table td {
      padding: 2.5px 1px;
      vertical-align: top;
      border-bottom: 1px dashed #e5e5e5;
    }
    .items-table tr:last-child td {
      border-bottom: none;
    }

    /* ── Totals & Grand Total ── */
    .totals-box {
      border-top: 1px dashed #555555;
      padding-top: 2.5px;
      margin-top: 2px;
      font-size: 9px;
    }
    .total-line {
      display: flex;
      justify-content: space-between;
      padding: 1px 0;
    }
    .grand-total-strip {
      border-top: 1px dashed #555555;
      border-bottom: 1px dashed #555555;
      padding: 3.5px 0;
      margin: 3px 0;
      font-size: 12px;
      display: flex;
      justify-content: space-between;
      text-transform: uppercase;
    }

    /* ── Tax Breakdown Section ── */
    .tax-box {
      border-top: 1px dashed #777777;
      padding: 2px 0;
      margin: 2px 0;
      font-size: 8px;
    }
    .tax-line {
      display: flex;
      justify-content: space-between;
      padding: 0.5px 0;
    }

    /* ── Payment Info ── */
    .payment-info {
      font-size: 8.5px;
      margin: 2px 0;
    }
    .mpesa-strip {
      border-top: 1px dashed #555555;
      border-bottom: 1px dashed #555555;
      padding: 2px 0;
      margin: 3px 0;
      text-align: center;
      font-size: 8.5px;
    }

    /* ── QR Code ── */
    .qr-area {
      text-align: center;
      margin: 3px 0 2px 0;
    }
    .qr-code-img {
      width: 80px;
      height: 80px;
      margin: 0 auto;
      display: block;
    }

    /* ── Footer ── */
    .footer-note {
      border-top: 1px dashed #555555;
      padding-top: 3px;
      margin-top: 3px;
      text-align: center;
      font-size: 8px;
      line-height: 1.35;
      color: #333333;
    }

    @media print {
      body {
        width: 80mm;
        padding: 1.5mm 2mm;
      }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header-area">
    <div class="comp-name">${company.name}</div>
    <div class="comp-details">
      ${company.address ? `${company.address}<br>` : ''}
      TEL: ${company.phone}
      ${showTax && company.pin ? ` • PIN: ${company.pin}` : ''}
    </div>
  </div>

  <!-- Document Title Strip (Thin Dashes) -->
  <div class="title-strip">
    ${isPaid ? (showTax ? 'TAX INVOICE' : 'OFFICIAL RECEIPT') : 'CUSTOMER BILL'}
  </div>

  <!-- Receipt Metadata Info -->
  <div class="info-grid">
    <div class="info-row">
      <span>Receipt: ${data.invoiceNo}</span>
      <span>Date: ${data.date} ${data.time}</span>
    </div>
    <div class="info-row">
      <span>Served by: ${data.cashier}</span>
      ${data.tableNo ? `<span>Table: ${data.tableNo}</span>` : `<span>Payment: ${data.paymentMethod.toUpperCase()}</span>`}
    </div>
    ${data.customerName ? `
    <div class="info-row">
      <span>Customer: ${data.customerName}</span>
      ${data.shiftCode ? `<span>Shift: ${data.shiftCode}</span>` : ''}
    </div>
    ` : ''}
  </div>

  <!-- Items Table (Thin Dashes) -->
  <table class="items-table">
    <thead>
      ${showTax ? `
      <tr>
        <th style="width:44%;text-align:left;">Item</th>
        <th style="width:10%;text-align:center;">Qty</th>
        <th style="width:18%;text-align:right;">Price</th>
        <th style="width:12%;text-align:right;">Tax</th>
        <th style="width:16%;text-align:right;">Amt</th>
      </tr>
      ` : `
      <tr>
        <th style="width:52%;text-align:left;">Item</th>
        <th style="width:12%;text-align:center;">Qty</th>
        <th style="width:18%;text-align:right;">Price</th>
        <th style="width:18%;text-align:right;">Amt</th>
      </tr>
      `}
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <!-- Subtotal & Discount -->
  <div class="totals-box">
    <div class="total-line">
      <span>Subtotal (${data.items.length} items, ${totalQty} pcs):</span>
      <span>Ksh ${data.subtotal.toLocaleString()}</span>
    </div>
    ${data.discount > 0 ? `
    <div class="total-line">
      <span>Discount:</span>
      <span>- Ksh ${data.discount.toLocaleString()}</span>
    </div>
    ` : ''}
  </div>

  <!-- Tax Breakdown (Only if showTax is ON) -->
  ${showTax ? `
  <div class="tax-box">
    <div style="text-align:center;margin-bottom:1.5px;font-size:7.5px;">TAX BREAKDOWN (18% INCL)</div>
    <div class="tax-line">
      <span>Net Amount:</span>
      <span>Ksh ${fmt(netAmt)}</span>
    </div>
    <div class="tax-line">
      <span>VAT (16%):</span>
      <span>Ksh ${fmt(vatAmt)}</span>
    </div>
    <div class="tax-line">
      <span>Catering Levy (2%):</span>
      <span>Ksh ${fmt(levyAmt)}</span>
    </div>
    <div class="tax-line" style="border-top:1px dashed #aaa;margin-top:1px;padding-top:1px;">
      <span>Total Tax:</span>
      <span>Ksh ${fmt(totTax)}</span>
    </div>
  </div>
  ` : ''}

  <!-- Grand Total (Thin Dashed Strip) -->
  <div class="grand-total-strip">
    <span>TOTAL:</span>
    <span>Ksh ${data.total.toLocaleString()}</span>
  </div>

  <!-- Settlement / Payment Info -->
  ${isPaid ? `
  <div class="payment-info">
    <div class="total-line">
      <span>Paid via ${data.paymentMethod.toUpperCase()}:</span>
      <span>Ksh ${(data.amountPaid || data.total).toLocaleString()}</span>
    </div>
    ${data.change > 0 ? `
    <div class="total-line">
      <span>Change Returned:</span>
      <span>Ksh ${data.change.toLocaleString()}</span>
    </div>
    ` : ''}
  </div>
  ${(data.paymentMethod.toUpperCase().includes('MPESA') || data.mpesaReceipt) ? `
  <div class="mpesa-strip">
    M-PESA REF: ${data.mpesaReceipt || data.verificationHash || 'CONFIRMED'}
  </div>
  ` : ''}
  ` : `
  <div class="title-strip" style="font-size:8.5px;margin:2px 0;">
    *** NOT PAID - PLEASE PAY AT COUNTER ***
  </div>
  `}

  <!-- Special Order Notes -->
  ${data.orderNotes ? `
  <div style="font-size:8px;margin:2px 0;font-style:italic;">
    Note: ${data.orderNotes}
  </div>
  ` : ''}

  <!-- QR Code (Compact 80px) -->
  ${(data.qrCodeData && qrDataUrl) ? `
  <div class="qr-area">
    <img src="${qrDataUrl}" alt="QR" class="qr-code-img" />
    <div style="font-size:7.5px;color:#555;margin-top:1px;">Scan to Verify Receipt</div>
  </div>
  ` : ''}

  <!-- Footer -->
  <div class="footer-note">
    <div>THANK YOU FOR DINING WITH US!</div>
    <div style="font-size:7.5px;">Goods once sold are not returnable</div>
    <div style="margin:2px 0;color:#888;">- - - - - - - - - - - - - - - - - - - -</div>
    <div style="font-size:7px;color:#888;">Alpha Plus POS</div>
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
