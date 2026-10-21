/**
 * Shared vendor SDK mocks. No test in this repo performs a real network call:
 * both SDK constructors are replaced and every completion is scripted.
 */
import { vi } from "vitest";

export const anthropicCreate = vi.fn();
export const openaiCreate = vi.fn();
export const anthropicCtorArgs: unknown[] = [];
export const openaiCtorArgs: unknown[] = [];

export function resetSdkMocks(): void {
  anthropicCreate.mockReset();
  openaiCreate.mockReset();
  anthropicCtorArgs.length = 0;
  openaiCtorArgs.length = 0;
}

export function claudeText(text: string) {
  return { content: [{ type: "text", text }] };
}

export function chatText(content: string | null) {
  return { choices: [{ message: { content } }] };
}
