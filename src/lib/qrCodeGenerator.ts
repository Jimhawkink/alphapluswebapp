import crypto from 'crypto';

/**
 * QR Code Generation and Validation Utilities for Hotel Receipts
 * Supports receipt authenticity verification
 */

export interface ReceiptQRData {
    receiptNo: string;
    totalAmount: number;
    saleDate: string;
    hotelName: string;
    timestamp: number;
}

/**
 * Generate QR code data string from receipt information
 * Format: base64 encoded JSON with verification signature
 */
export function generateQRCodeData(data: ReceiptQRData): string {
    const payload = {
        r: data.receiptNo,
        a: data.totalAmount,
        d: data.saleDate,
        h: data.hotelName,
        t: data.timestamp,
    };

    // Create JSON string
    const jsonString = JSON.stringify(payload);

    // Encode to base64
    const base64Data = Buffer.from(jsonString).toString('base64');

    // Add a simple checksum (first 8 chars of hash)
    const checksum = crypto
        .createHash('sha256')
        .update(jsonString + process.env.NEXT_PUBLIC_QR_SECRET || 'alphahotel2026')
        .digest('hex')
        .substring(0, 8);

    return `${base64Data}.${checksum}`;
}

/**
 * Generate verification hash for database storage
 * Used for quick lookup of receipts
 */
export function generateVerificationHash(qrData: string): string {
    return crypto
        .createHash('sha256')
        .update(qrData)
        .digest('hex');
}

/**
 * Validate and decode QR code data
 * Returns null if invalid
 */
export function validateQRCode(qrCodeString: string): ReceiptQRData | null {
    try {
        const parts = qrCodeString.split('.');
        if (parts.length !== 2) return null;

        const [base64Data, checksum] = parts;

        // Decode base64
        const jsonString = Buffer.from(base64Data, 'base64').toString('utf-8');

        // Verify checksum
        const expectedChecksum = crypto
            .createHash('sha256')
            .update(jsonString + (process.env.NEXT_PUBLIC_QR_SECRET || 'alphahotel2026'))
            .digest('hex')
            .substring(0, 8);

        if (checksum !== expectedChecksum) {
            console.error('QR Code checksum mismatch');
            return null;
        }

        // Parse JSON
        const payload = JSON.parse(jsonString);

        return {
            receiptNo: payload.r,
            totalAmount: payload.a,
            saleDate: payload.d,
            hotelName: payload.h,
            timestamp: payload.t,
        };
    } catch (error) {
        console.error('Error validating QR code:', error);
        return null;
    }
}

/**
 * Generate QR code data for client-side (browser)
 * Uses Web Crypto API instead of Node crypto
 */
export async function generateQRCodeDataClient(data: ReceiptQRData): Promise<string> {
    const payload = {
        r: data.receiptNo,
        a: data.totalAmount,
        d: data.saleDate,
        h: data.hotelName,
        t: data.timestamp,
    };

    const jsonString = JSON.stringify(payload);
    const base64Data = btoa(jsonString);

    // Simple checksum for client-side
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(jsonString + 'alphahotel2026');
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const checksum = hashArray
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .substring(0, 8);

    return `${base64Data}.${checksum}`;
}

/**
 * Format amount for display in KES
 */
export function formatKES(amount: number): string {
    return `KES ${amount.toLocaleString('en-KE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

/**
 * Calculate Kenya taxes from subtotal
 * 
 * @param subtotal - Base amount before tax
 * @param taxMode - 'inclusive' or 'exclusive'
 * @param vatRate - VAT percentage (default 16%)
 * @param levyRate - Tourism/Catering Levy percentage (default 2%)
 * @returns Object with tax breakdown
 */
export function calculateKenyaTax(
    subtotal: number,
    taxMode: 'inclusive' | 'exclusive' = 'inclusive',
    vatRate: number = 16,
    levyRate: number = 2
): {
    netAmount: number;
    vatAmount: number;
    levyAmount: number;
    totalTax: number;
    grandTotal: number;
} {
    const totalTaxRate = vatRate + levyRate; // 18% total

    if (taxMode === 'inclusive') {
        // Prices already include tax
        // Net = Subtotal / (1 + TaxRate/100)
        const netAmount = subtotal / (1 + totalTaxRate / 100);
        const totalTax = subtotal - netAmount;
        const vatAmount = (netAmount * vatRate) / 100;
        const levyAmount = (netAmount * levyRate) / 100;

        return {
            netAmount: Math.round(netAmount * 100) / 100,
            vatAmount: Math.round(vatAmount * 100) / 100,
            levyAmount: Math.round(levyAmount * 100) / 100,
            totalTax: Math.round(totalTax * 100) / 100,
            grandTotal: subtotal
        };
    } else {
        // Prices don't include tax - add tax on top
        const vatAmount = (subtotal * vatRate) / 100;
        const levyAmount = (subtotal * levyRate) / 100;
        const totalTax = vatAmount + levyAmount;
        const grandTotal = subtotal + totalTax;

        return {
            netAmount: subtotal,
            vatAmount: Math.round(vatAmount * 100) / 100,
            levyAmount: Math.round(levyAmount * 100) / 100,
            totalTax: Math.round(totalTax * 100) / 100,
            grandTotal: Math.round(grandTotal * 100) / 100
        };
    }
}
