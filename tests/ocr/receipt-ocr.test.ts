/**
 * Receipt OCR handler. Ported from the app's OCR route tests; the OCR engine
 * is a stub, so no Tesseract worker is started.
 */
import { describe, it, expect, vi } from "vitest";
import {
  handleReceiptOcr,
  UnauthorizedError,
  type OcrEngine,
} from "../../src/lib/ocr/receipt-ocr";

const RECEIPT = [
  "Sample Mart",
  "Date: 20/02/2025",
  "Subtotal ₦1,000",
  "VAT ₦75.00",
  "Total ₦1,075.00",
].join("\r\n");

const engine = (text: string): OcrEngine & { recognize: ReturnType<typeof vi.fn> } => ({
  recognize: vi.fn(async () => text),
});
const image = Buffer.from("fake image bytes").toString("base64");

describe("handleReceiptOcr", () => {
  it("returns 400 when imageBase64 is missing", async () => {
    const res = await handleReceiptOcr({}, { engine: engine("") });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/imageBase64|Missing/i);
  });

  it("returns 400 when imageBase64 is not a string", async () => {
    const res = await handleReceiptOcr({ imageBase64: 123 }, { engine: engine("") });
    expect(res.status).toBe(400);
  });

  it("returns 400 when the base64 decodes to nothing", async () => {
    const res = await handleReceiptOcr({ imageBase64: "!!!" }, { engine: engine("") });
    expect(res).toEqual({ status: 400, body: { error: "Invalid base64 image" } });
  });

  it("validates input before authenticating", async () => {
    const authenticate = vi.fn(async () => {});
    await handleReceiptOcr(null, { engine: engine(""), authenticate });
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("returns 401 when authentication fails", async () => {
    const e = engine(RECEIPT);
    const res = await handleReceiptOcr(
      { imageBase64: image },
      { engine: e, authenticate: async () => { throw new UnauthorizedError(); } },
    );
    expect(res.status).toBe(401);
    expect(e.recognize).not.toHaveBeenCalled();
  });

  it("returns normalised text and parsed fields", async () => {
    const e = engine(RECEIPT);
    const res = await handleReceiptOcr({ imageBase64: image }, { engine: e });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      text: RECEIPT.replace(/\r\n/g, "\n"),
      vendor: "Sample Mart",
      date: "2025-02-20",
      amount: 1075,
      vat: 75,
    });
    expect(Buffer.isBuffer(e.recognize.mock.calls[0]![0])).toBe(true);
  });

  it("returns a friendly 500 and logs when OCR throws", async () => {
    const logger = { error: vi.fn() };
    const res = await handleReceiptOcr(
      { imageBase64: image },
      { engine: { recognize: async () => { throw new Error("worker crashed"); } }, logger },
    );
    expect(res.status).toBe(500);
    expect((res.body as { error: string }).error).toMatch(/couldn't read this receipt/);
    expect(logger.error).toHaveBeenCalledWith("OCR error", {
      error: "worker crashed",
      operation: "expenses/ocr",
    });
  });
});
