/**
 * Transaction shape consumed by the categorisation service.
 *
 * Local stand-in for the application's ingestion `Transaction` type. Only the
 * fields the categorisation code reads are required here; the full app type
 * also carries persistence metadata (user, source file, timestamps).
 */
export interface Transaction {
  id: string;
  date: string; // ISO 8601 format: YYYY-MM-DD
  description: string; // Transaction narration/merchant
  amount: number; // Absolute value (always positive)
  type: "debit" | "credit";
  currency?: string; // ISO 4217 code (default: NGN)
  category?: string;
  confidence_score?: number; // 0.0 to 1.0
}
