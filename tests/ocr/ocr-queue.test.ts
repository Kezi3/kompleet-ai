/**
 * Offline OCR queue. Uses an in-memory stand-in for the device SQLite table
 * and a mocked fetch; nothing leaves the process.
 */
import { describe, it, expect, vi } from "vitest";
import { createOcrQueue, type SyncDb } from "../../src/lib/ocr/ocr-queue";

interface Row {
  id: number;
  image_path: string;
  processed_at: string | null;
  expense_id: string | null;
}

function memoryDb(): SyncDb & { rows: Row[] } {
  const rows: Row[] = [];
  let lastId = 0;
  return {
    rows,
    runSync(sql: string, params: unknown[] = []) {
      if (sql.startsWith("insert into ocr_queue")) {
        rows.push({ id: ++lastId, image_path: String(params[0]), processed_at: null, expense_id: null });
      } else if (sql.includes("expense_id = ?")) {
        const r = rows.find((x) => x.id === params[1])!;
        r.processed_at = "now";
        r.expense_id = String(params[0]);
      } else if (sql.startsWith("update ocr_queue")) {
        rows.find((x) => x.id === params[0])!.processed_at = "now";
      }
      return undefined;
    },
    getAllSync<T>(sql: string): T[] {
      if (sql.includes("last_insert_rowid")) return [{ id: lastId }] as T[];
      return rows
        .filter((r) => r.processed_at === null)
        .map(({ id, image_path }) => ({ id, image_path })) as T[];
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setup(fetchImpl: typeof fetch) {
  const db = memoryDb();
  let n = 0;
  const createExpense = vi.fn(() => ({ id: `exp-${++n}` }));
  const queue = createOcrQueue({
    getDb: () => db,
    createExpense,
    readFileAsBase64: async (p) => Buffer.from(p).toString("base64"),
    fetch: fetchImpl,
  });
  return { db, queue, createExpense };
}

const API = "https://kompleet.techivano.com";

describe("OCR queue", () => {
  it("enqueues images and lists pending items", () => {
    const { queue } = setup(vi.fn());
    expect(queue.enqueueOcr("file:///a.jpg")).toBe(1);
    expect(queue.enqueueOcr("file:///b.jpg")).toBe(2);
    expect(queue.getPendingOcrItems().map((r) => r.image_path)).toEqual([
      "file:///a.jpg",
      "file:///b.jpg",
    ]);
  });

  it("runs OCR, sends the bearer token and creates an NGN expense", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ text: "Sample Mart\nTotal ₦500", vendor: "Sample Mart", date: "2025-02-20", amount: 500, vat: 37.5 }),
    );
    const { queue, createExpense } = setup(fetchMock as unknown as typeof fetch);
    const res = await queue.runOcrOnImage("file:///a.jpg", "user-1", API, async () => "tok");
    expect(res).toMatchObject({ expenseId: "exp-1", parsed: { vendor: "Sample Mart", amount: 500, vatAmount: 37.5 } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API}/api/expenses/ocr`);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(createExpense).toHaveBeenCalledWith("user-1", {
      date: "2025-02-20",
      amount: 500,
      currency: "NGN",
      vendor: "Sample Mart",
      vatAmount: 37.5,
      notes: "Sample Mart\nTotal ₦500",
    });
  });

  it("defaults amount to 0 and date to today when OCR finds nothing", async () => {
    const { queue, createExpense } = setup((async () => jsonResponse({})) as unknown as typeof fetch);
    await queue.runOcrOnImage("p", "u", API, async () => null);
    const input = (createExpense.mock.calls[0] as unknown as [string, { amount: number; date: string }])[1];
    expect(input.amount).toBe(0);
    expect(input.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns an error for a non OK response", async () => {
    const { queue } = setup((async () => new Response("", { status: 503 })) as unknown as typeof fetch);
    expect(await queue.runOcrOnImage("p", "u", API, async () => null)).toEqual({ error: "OCR API 503" });
  });

  it("processes the queue, marking successes and failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ amount: 100 }))
      .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))
      .mockRejectedValueOnce(new Error("offline"));
    const { queue, db } = setup(fetchMock as unknown as typeof fetch);
    queue.enqueueOcr("a");
    queue.enqueueOcr("b");
    queue.enqueueOcr("c");
    const out = await queue.processOcrQueue("u", API, async () => "tok");
    expect(out).toEqual({ processed: 1, errors: ["Unauthorized", "offline"] });
    expect(db.rows.map((r) => r.expense_id)).toEqual(["exp-1", null, null]);
    expect(queue.getPendingOcrItems()).toHaveLength(0);
  });
});
