/**
 * Unit tests for expense OCR parsing (parseReceiptText, parseAmount, parseDate, parseVendor, parseVat).
 */
import { describe, it, expect } from "vitest";
import {
  parseReceiptText,
  parseAmount,
  parseDate,
  parseVendor,
  parseVat,
} from "../../src/lib/ocr/parse-receipt-text";

describe("Expense OCR parsing", () => {
  describe("parseAmount", () => {
    it("extracts last NGN amount", () => {
      expect(parseAmount("Total ₦1,500.00")).toBe(1500);
      expect(parseAmount("NGN 2,000.00")).toBe(2000);
      expect(parseAmount("Amount N 500.50")).toBe(500.5);
    });

    it("returns null when no amount", () => {
      expect(parseAmount("No numbers here")).toBeNull();
      expect(parseAmount("")).toBeNull();
    });

    it("prefers last match (total at bottom)", () => {
      expect(parseAmount("Subtotal ₦100\nVAT ₦7.50\nTotal ₦107.50")).toBe(
        107.5,
      );
    });
  });

  describe("parseDate", () => {
    it("parses DD/MM/YYYY", () => {
      expect(parseDate("Date: 25/12/2024")).toBe("2024-12-25");
      expect(parseDate("01/06/24")).toBe("2024-06-01");
    });

    it("parses DD-MM-YYYY", () => {
      expect(parseDate("15-03-2025")).toBe("2025-03-15");
    });

    it("returns null for invalid or missing", () => {
      expect(parseDate("no date")).toBeNull();
      expect(parseDate("32/01/2024")).toBeNull();
      expect(parseDate("01/13/2024")).toBeNull();
    });
  });

  describe("parseVendor", () => {
    it("returns first non-empty line", () => {
      expect(parseVendor("Sample Mart\nLagos\n₦500")).toBe("Sample Mart");
      expect(parseVendor("  Corner Store  \n")).toBe("Corner Store");
    });

    it("returns null for empty or too long", () => {
      expect(parseVendor("")).toBeNull();
      expect(parseVendor("x")).toBeNull();
      expect(parseVendor("a".repeat(81))).toBeNull();
    });
  });

  describe("parseVat", () => {
    it("extracts VAT amount", () => {
      expect(parseVat("VAT: ₦75.00")).toBe(75);
      expect(parseVat("Tax = 150")).toBe(150);
    });

    it("returns null when no VAT", () => {
      expect(parseVat("Total 1000")).toBeNull();
    });
  });

  describe("parseReceiptText", () => {
    it("returns all fields from sample receipt text", () => {
      const text = [
        "Sample Mart",
        "Lagos",
        "Date: 20/02/2025",
        "Subtotal ₦1,000",
        "VAT ₦75.00",
        "Total ₦1,075.00",
      ].join("\n");
      const out = parseReceiptText(text);
      expect(out.vendor).toBe("Sample Mart");
      expect(out.date).toBe("2025-02-20");
      expect(out.amount).toBe(1075);
      expect(out.vat).toBe(75);
    });

    it("handles empty text", () => {
      const out = parseReceiptText("");
      expect(out.vendor).toBeNull();
      expect(out.date).toBeNull();
      expect(out.amount).toBeNull();
      expect(out.vat).toBeNull();
    });
  });
});
