/**
 * Receipt OCR handler (framework agnostic).
 *
 * Core of the `POST /api/expenses/ocr` route: accept a base64 image, run OCR,
 * and return the extracted text plus parsed fields (vendor, date, amount, vat).
 * The HTTP framework, auth backend, rate limiting and logger are injected so
 * the logic can run and be tested on its own.
 */
import { parseReceiptText } from "./parse-receipt-text";

/** Minimal OCR engine contract (implemented by Tesseract in production). */
export interface OcrEngine {
  recognize(image: Buffer): Promise<string>;
}

export interface ReceiptOcrResponse {
  text: string;
  vendor: string | null;
  date: string | null;
  amount: number | null;
  vat: number | null;
}

export interface ErrorBody {
  error: string;
}

export interface OcrHandlerResult {
  status: number;
  body: ReceiptOcrResponse | ErrorBody;
}

/** Thrown by an `authenticate` hook when the caller is not signed in. */
export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export interface OcrHandlerDeps {
  engine: OcrEngine;
  /** Throws UnauthorizedError when the request is not authenticated. */
  authenticate?: () => Promise<void>;
  logger?: { error(message: string, meta?: Record<string, unknown>): void };
}

const FRIENDLY_OCR_ERROR = "We couldn't read this receipt. Please try again.";

export async function handleReceiptOcr(
  body: unknown,
  deps: OcrHandlerDeps,
): Promise<OcrHandlerResult> {
  try {
    const imageBase64 = (body as { imageBase64?: unknown } | null)?.imageBase64;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return { status: 400, body: { error: "Missing or invalid imageBase64" } };
    }

    if (deps.authenticate) await deps.authenticate();

    const buffer = Buffer.from(imageBase64, "base64");
    if (buffer.length === 0) {
      return { status: 400, body: { error: "Invalid base64 image" } };
    }

    const text = await deps.engine.recognize(buffer);

    const normalized = (text ?? "").replace(/\r\n/g, "\n").trim();
    const parsed = parseReceiptText(normalized);

    return {
      status: 200,
      body: {
        text: normalized,
        vendor: parsed.vendor ?? null,
        date: parsed.date ?? null,
        amount: parsed.amount ?? null,
        vat: parsed.vat ?? null,
      },
    };
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return { status: 401, body: { error: "Unauthorized" } };
    }
    deps.logger?.error("OCR error", {
      error: err instanceof Error ? err.message : String(err),
      operation: "expenses/ocr",
    });
    return { status: 500, body: { error: FRIENDLY_OCR_ERROR } };
  }
}

/**
 * Production OCR engine backed by tesseract.js (English model).
 * Loaded lazily so tests and consumers that inject their own engine never
 * pull in the WASM worker.
 */
export function createTesseractEngine(lang = "eng"): OcrEngine {
  return {
    async recognize(image: Buffer): Promise<string> {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker(lang);
      try {
        const {
          data: { text },
        } = await worker.recognize(image);
        return text ?? "";
      } finally {
        await worker.terminate();
      }
    },
  };
}
