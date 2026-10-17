// Thermal Receipt Printing Utilities
// Works with 58mm and 80mm thermal printers

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

// Generate SUPER POWERFUL Customer Bill HTML with NOT PAID watermark
export function generateCustomerBillHTML(data: ReceiptData, company: CompanyInfo = defaultCompanyInfo, isPaid: boolean = false): string {
  // Generate item rows with per-item tax
  const itemRows = data.items.map(item => {
    // Calculate per-item tax (18% inclusive)
    const itemSubtotal = item.total - (item.discount || 0);
    const itemTaxRate = 0.18; // 16% VAT + 2% Levy
    const itemNetAmount = itemSubtotal / (1 + itemTaxRate);
    const itemTaxAmount = itemSubtotal - itemNetAmount;

    const itemNotes = item.notes ? `<div style="font-size:8px;color:#666;font-style:italic;">${item.notes}</div>` : '';
    const itemDiscount = item.discount && item.discount > 0
      ? `<div style="font-size:8px;color:#4CAF50;font-weight:bold;">-Ksh ${item.discount.toLocaleString()}</div>`
      : '';
    return `
      <tr>
        <td>
          <div style="font-weight:bold;">${item.name}</div>
          ${itemNotes}
          ${itemDiscount}
        </td>
        <td style="text-align:center;">${item.qty}</td>
        <td style="text-align:right;">${item.price.toLocaleString()}</td>
        <td style="text-align:right;font-size:8px;color:#2563eb;">${Math.round(itemTaxAmount).toLocaleString()}</td>
        <td style="text-align:right;font-weight:bold;">${item.total.toLocaleString()}</td>
      </tr>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Customer Bill - ${data.invoiceNo}</title>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39+Text&display=swap" rel="stylesheet">
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
      font-family: 'Roboto', sans-serif;
      font-size: 10px;
      width: 80mm;
      padding: 4mm;
      background: #fff;
      color: #000;
      position: relative;
    }
    .header {
      text-align: center;
      padding-bottom: 5px;
      border-bottom: 2px double #000;
      margin-bottom: 8px;
    }
    .company-logo {
      font-size: 24px;
      margin-bottom: 2px;
    }
    .company-name {
      font-size: 14px;
      font-weight: 900;
      text-transform: uppercase;
    }
    .company-details {
      font-size: 9px;
      color: #333;
      line-height: 1.2;
    }
    .warning-strip {
        background: #000;
        color: #fff;
        text-align: center;
        font-weight: bold;
        padding: 4px;
        font-size: 12px;
        margin: 8px 0;
        text-transform: uppercase;
    }
    .info-compact-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        background: #f3f4f6;
        padding: 6px;
        border-radius: 4px;
        gap: 2px 8px;
        margin-bottom: 8px;
    }
    .info-compact-label {
        font-size: 8px;
        color: #666;
    }
    .info-compact-value {
        font-size: 10px;
        font-weight: 700;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      margin-bottom: 5px;
    }
    .items-table th {
      background: #e5e5e5;
      padding: 4px 2px;
      text-align: left;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .items-table td {
      padding: 3px 2px;
      border-bottom: 1px dashed #ccc;
    }
     .items-table tr:last-child td {
        border-bottom: 2px solid #000;
    }
    .totals-compact {
        margin-top: 5px;
    }
    .total-line {
        display: flex;
        justify-content: space-between;
        padding: 1px 0;
    }
    .tax-breakdown-box {
        background: #f9fafb;
        border: 1px dashed #d1d5db;
        padding: 4px;
        margin: 5px 0;
        border-radius: 3px;
    }
    .grand-total-black {
        background: #000;
        color: #fff;
        padding: 8px;
        display: flex;
        justify-content: space-between;
        font-weight: 900;
        font-size: 16px;
        margin: 5px 0;
        border-radius: 4px;
    }
    .status-unpaid {
        border: 2px solid #ef4444;
        color: #ef4444;
        padding: 4px;
        text-align: center;
        font-weight: 800;
        background: #fef2f2;
        font-size: 12px;
        margin-bottom: 5px;
        border-radius: 4px;
    }
    .status-paid {
        border: 2px solid #22c55e;
        color: #15803d;
        padding: 4px;
        text-align: center;
        font-weight: 800;
        background: #f0fdf4;
        font-size: 12px;
        margin-bottom: 5px;
        border-radius: 4px;
    }
    .barcode-section {
      text-align: center;
      margin: 5px 0;
    }
    .barcode {
      font-family: 'Libre Barcode 39 Text', monospace;
      font-size: 30px;
    }
    .footer {
      text-align: center;
      margin-top: 10px;
      padding-top: 5px;
      border-top: 1px dashed #000;
      font-size: 9px;
      color: #555;
    }
    @media print {
      body { width: 80mm; }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="company-logo">🍽️</div>
    <div class="company-name">${company.name}</div>
    <div class="company-details">
      📍 ${company.address}<br>
      📞 ${company.phone}
      ${company.pin ? `<br>PIN: ${company.pin}` : ''}
    </div>
    ${company.slogan ? `<div style="font-size:8px;font-style:italic;margin-top:2px;">"${company.slogan}"</div>` : ''}
  </div>

  <!-- Bill Title -->
  <div class="warning-strip">
    ${isPaid ? '✓ TAX INVOICE ✓' : '⚠ CUSTOMER BILL ⚠'}
  </div>

  <!-- Info Grid -->
  <div class="info-compact-grid">
    <div>
      <div class="info-compact-label">Invoice No:</div>
      <div class="info-compact-value">${data.invoiceNo}</div>
    </div>
    <div>
      <div class="info-compact-label">Date:</div>
      <div class="info-compact-value">${data.date}</div>
    </div>
    <div>
      <div class="info-compact-label">Time:</div>
      <div class="info-compact-value">${data.time}</div>
    </div>
    <div>
      <div class="info-compact-label">Cashier:</div>
      <div class="info-compact-value">${data.cashier}</div>
    </div>
    ${data.tableNo ? `
    <div>
      <div class="info-compact-label">Table:</div>
      <div class="info-compact-value">${data.tableNo}</div>
    </div>
    ` : ''}
    ${data.customerName ? `
    <div>
       <div class="info-compact-label">Customer:</div>
       <div class="info-compact-value">${data.customerName}</div>
    </div>
    ` : ''}
  </div>

  <!-- Items -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="width:40%">ITEM</th>
        <th style="width:10%;text-center">QTY</th>
        <th style="width:20%;text-align:right">PRICE</th>
        <th style="width:15%;text-align:right">TAX</th>
        <th style="width:15%;text-align:right">TOTAL</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <!-- Totals -->
  <div class="totals-compact">
    <div class="total-line" style="font-weight:bold; font-size:10px; margin-bottom:2px;">
      <span>Subtotal (${data.items.length} items):</span>
      <span>Ksh ${data.subtotal.toLocaleString()}</span>
    </div>
    ${data.discount > 0 ? `
    <div class="total-line" style="color:#15803d; font-weight:bold;">
      <span>Discount:</span>
      <span>- Ksh ${data.discount.toLocaleString()}</span>
    </div>
    ` : ''}
    
    ${data.taxMode === 'inclusive' && data.netAmount ? `
    <div class="total-line" style="font-size:9px; color:#666;">
      <span>Net Amount (excl. tax):</span>
      <span>Ksh ${data.netAmount.toLocaleString()}</span>
    </div>
    ` : ''}

    <!-- Tax Breakdown -->
    ${(data.vatAmount && data.vatAmount > 0) || (data.levyAmount && data.levyAmount > 0) ? `
    <div class="tax-breakdown-box">
        <div class="total-line"><span style="font-weight:bold;font-size:9px;">Tax Breakdown:</span></div>
        ${data.vatAmount && data.vatAmount > 0 ? `
        <div class="total-line" style="font-size:9px;">
            <span>VAT ${data.vatRate || 16}%:</span>
            <span>${data.vatAmount.toLocaleString()}</span>
        </div>
        ` : ''}
        ${data.levyAmount && data.levyAmount > 0 ? `
        <div class="total-line" style="font-size:9px;">
            <span>Tourism Levy ${data.levyRate || 2}%:</span>
            <span>${data.levyAmount.toLocaleString()}</span>
        </div>
        ` : ''}
        <div class="total-line" style="border-top:1px solid #ddd; margin-top:2px; padding-top:2px; font-weight:bold; font-size:9px;">
            <span>Total Tax:</span>
            <span>Ksh ${(data.totalTax || data.tax || 0).toLocaleString()}</span>
        </div>
    </div>
    ` : ''}
  </div>

  <!-- Grand Total -->
  <div class="grand-total-black">
    <span>GRAND TOTAL:</span>
    <span>Ksh ${data.total.toLocaleString()}</span>
  </div>

  <!-- Status -->
  ${!isPaid ? `
  <div class="status-unpaid">
    ❌ NOT PAID (PENDING)
    <div style="font-size:9px; font-weight:normal; color:#000; margin-top:2px;">Please pay at the counter</div>
  </div>
  ` : `
  <div class="status-paid">
    ✓ PAID (${data.paymentMethod.toUpperCase()})
    ${data.change > 0 ? `<div style="font-size:9px;color:#15803d;margin-top:2px;">Change: Ksh ${data.change.toLocaleString()}</div>` : ''}
  </div>
  `}

  ${data.orderNotes ? `
  <div style="background:#fff3cd; border:1px solid #ffc107; padding:5px; margin:5px 0; font-size:9px; border-radius:3px;">
    📝 <strong>Note:</strong> ${data.orderNotes}
  </div>
  ` : ''}

  ${data.qrCodeData ? `
  <div style="text-align:center; padding:5px; border:1px dashed #ccc; margin-top:5px;">
    <div style="font-weight:bold; font-size:9px;">✓ Scan to Verify Receipt</div>
    <div style="display:flex; justify-content:center; margin:3px 0;">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&ecc=M&data=${encodeURIComponent(data.qrCodeData)}" alt="QR" style="width:60px;height:60px;">
    </div>
  </div>
  ` : ''}

  <div class="barcode-section">
    <div class="barcode">*${data.invoiceNo}*</div>
  </div>

  <div class="footer">
    <div style="font-weight:bold; font-size:10px;">★ THANK YOU FOR DINING WITH US! ★</div>
    <div>We appreciate your business</div>
    <div style="margin-top:4px;">
      ${isPaid ? 'This serves as your official tax invoice' : 'This is not a tax invoice until payment is complete'}
    </div>
    <div>Goods once sold are not refundable</div>
    <div style="font-size:8px; color:#999; margin-top:5px;">Powered by Alpha Plus POS v2.0</div>
  </div>

</body>
</html>
`;
}

// Generate thermal receipt HTML (for paid receipts)
export function generateReceiptHTML(data: ReceiptData, company: CompanyInfo = defaultCompanyInfo): string {
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
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap" rel="stylesheet">
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
      font-family: 'Roboto', sans-serif;
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
export function printCustomerReceipt(data: ReceiptData, company?: CompanyInfo): void {
  const html = generateReceiptHTML(data, company);
  printReceipt(html);
}

// Print KOT
export function printKOT(data: KOTData, company?: CompanyInfo): void {
  const html = generateKOTHTML(data, company);
  printReceipt(html);
}

// Print unpaid customer bill (with NOT PAID watermark)
export function printUnpaidBill(data: ReceiptData, company?: CompanyInfo): void {
  const html = generateCustomerBillHTML(data, company, false);
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
