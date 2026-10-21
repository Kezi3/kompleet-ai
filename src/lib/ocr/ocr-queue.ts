/**
 * OCR queue: enqueue image path when offline; process when online (API + expense).
 *
 * Extracted from the mobile app. The Expo file system, the on-device SQLite
 * handle and the local expense repository are injected through the small
 * interfaces below so the queue logic runs anywhere.
 */

export interface ParsedReceipt {
  vendor: string | null;
  date: string | null; // YYYY-MM-DD
  amount: number | null;
  vatAmount: number | null;
  rawText: string;
}

/** Subset of the expo-sqlite synchronous API used by the queue. */
export interface SyncDb {
  runSync(sql: string, params?: unknown[]): unknown;
  getAllSync<T>(sql: string, params?: unknown[]): T[];
}

export interface NewExpenseInput {
  date: string;
  amount: number;
  currency: string;
  vendor?: string;
  vatAmount?: number;
  notes?: string;
}

export interface OcrQueueDeps {
  getDb: () => SyncDb;
  createExpense: (userId: string, input: NewExpenseInput) => { id: string };
  /** Read a local image file and return its contents as base64. */
  readFileAsBase64: (path: string) => Promise<string>;
  fetch?: typeof fetch;
}

export function createOcrQueue(deps: OcrQueueDeps) {
  const { getDb, createExpense, readFileAsBase64 } = deps;
  const doFetch = deps.fetch ?? fetch;

  function enqueueOcr(imagePath: string): number {
    const db = getDb();
    db.runSync(`insert into ocr_queue (image_path) values (?)`, [imagePath]);
    const row = db.getAllSync<{ id: number }>(
      "select last_insert_rowid() as id",
    );
    return row[0]?.id ?? 0;
  }

  function getPendingOcrItems(): { id: number; image_path: string }[] {
    const db = getDb();
    return db.getAllSync<{ id: number; image_path: string }>(
      "select id, image_path from ocr_queue where processed_at is null order by id",
    );
  }

  function markOcrProcessed(id: number, expenseId: string): void {
    const db = getDb();
    db.runSync(
      'update ocr_queue set processed_at = datetime("now"), expense_id = ? where id = ?',
      [expenseId, id],
    );
  }

  function markOcrFailed(id: number): void {
    const db = getDb();
    db.runSync(
      'update ocr_queue set processed_at = datetime("now") where id = ?',
      [id],
    );
  }

  /**
   * Call server OCR API with image at path; parse response; create expense and return id.
   * Caller is responsible for uploading the receipt image and linking it to the expense.
   */
  async function runOcrOnImage(
    imagePath: string,
    userId: string,
    apiBaseUrl: string,
    getAuthToken: () => Promise<string | null>,
  ): Promise<{ parsed: ParsedReceipt; expenseId: string } | { error: string }> {
    const base64 = await readFileAsBase64(imagePath);
    const token = await getAuthToken();
    const res = await doFetch(`${apiBaseUrl}/api/expenses/ocr`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ imageBase64: base64 }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { error: text || `OCR API ${res.status}` };
    }
    const data = (await res.json()) as {
      text?: string;
      vendor?: string;
      date?: string;
      amount?: number;
      vat?: number;
    };
    const rawText = data.text ?? "";
    const parsed: ParsedReceipt = {
      vendor: data.vendor ?? null,
      date: data.date ?? null,
      amount: data.amount ?? null,
      vatAmount: data.vat ?? null,
      rawText,
    };
    const date = parsed.date ?? new Date().toISOString().slice(0, 10);
    const amount = parsed.amount ?? 0;
    const expense = createExpense(userId, {
      date,
      amount,
      currency: "NGN",
      vendor: parsed.vendor ?? undefined,
      vatAmount: parsed.vatAmount ?? undefined,
      notes: rawText.slice(0, 500),
    });
    return { parsed, expenseId: expense.id };
  }

  /**
   * Process all pending OCR queue items (call when back online).
   * Returns count processed and any errors.
   */
  async function processOcrQueue(
    userId: string,
    apiBaseUrl: string,
    getAuthToken: () => Promise<string | null>,
  ): Promise<{ processed: number; errors: string[] }> {
    const pending = getPendingOcrItems();
    const errors: string[] = [];
    let processed = 0;
    for (const item of pending) {
      try {
        const result = await runOcrOnImage(
          item.image_path,
          userId,
          apiBaseUrl,
          getAuthToken,
        );
        if ("error" in result) {
          errors.push(result.error);
          markOcrFailed(item.id);
        } else {
          markOcrProcessed(item.id, result.expenseId);
          processed++;
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
        markOcrFailed(item.id);
      }
    }
    return { processed, errors };
  }

  return {
    enqueueOcr,
    getPendingOcrItems,
    markOcrProcessed,
    markOcrFailed,
    runOcrOnImage,
    processOcrQueue,
  };
}
