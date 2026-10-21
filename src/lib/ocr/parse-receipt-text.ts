/**
 * Parse receipt OCR text into structured fields (Nigerian context: ₦/NGN, DD/MM/YYYY).
 * Used by API route and testable without Tesseract.
 */
export interface ParsedReceiptFields {
  vendor: string | null;
  date: string | null;
  amount: number | null;
  vat: number | null;
}

const NGN_AMOUNT = /(?:₦|NGN|N)\s*([\d,]+(?:\.\d{2})?)/gi;
const DATE_DMY = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/g;
const VAT_LIKE =
  /(?:VAT|vat|Tax)\s*(?:[:=]?\s*)?(?:₦|NGN)?\s*([\d,]+(?:\.\d{2})?)/gi;

export function parseAmount(text: string): number | null {
  const matches = [...text.matchAll(NGN_AMOUNT)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1];
  const value = last[1]!.replace(/,/g, "");
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

export function parseDate(text: string): string | null {
  const match = text.match(DATE_DMY);
  if (!match) return null;
  const last = match[match.length - 1]!;
  const parts = last.split(/[\/\-]/);
  if (parts.length !== 3) return null;
  const d = parseInt(parts[0]!, 10);
  const m = parseInt(parts[1]!, 10);
  let y = parseInt(parts[2]!, 10);
  if (y < 100) y += 2000;
  if (d < 1 || d > 31 || m < 1 || m > 12) return null;
  const month = m < 10 ? `0${m}` : `${m}`;
  const day = d < 10 ? `0${d}` : `${d}`;
  return `${y}-${month}-${day}`;
}

export function parseVendor(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const first = lines[0];
  if (first && first.length > 1 && first.length < 80) return first;
  return null;
}

export function parseVat(text: string): number | null {
  const matches = [...text.matchAll(VAT_LIKE)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1];
  const value = last[1]?.replace(/,/g, "") ?? "";
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

export function parseReceiptText(rawText: string): ParsedReceiptFields {
  const normalized = rawText.replace(/\r\n/g, "\n").trim();
  return {
    vendor: parseVendor(normalized),
    date: parseDate(normalized),
    amount: parseAmount(normalized),
    vat: parseVat(normalized),
  };
}
