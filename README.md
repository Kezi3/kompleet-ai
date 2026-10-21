# kompleet-ai

Multi-provider LLM transaction categorisation with automatic fallback, plus receipt OCR parsing, in TypeScript.

This code was extracted from Kompleet, an AI-assisted invoicing and tax tool for Nigerian small businesses (public product at kompleet.techivano.com). It has been made standalone: app internals such as the database, auth and framework glue are replaced by small injected interfaces, so the logic builds and tests on its own.

## What it does

* **Transaction categorisation.** Sorts bank transactions into 25 accounting categories suited to Nigerian businesses. Claude, OpenAI and Kimi (Moonshot) providers share one `AIProvider` interface. A factory picks providers in priority order (Claude, OpenAI, Kimi, then a keyword rule engine that needs no API key). `ProviderWithFallback` moves to the next provider when one errors or answers with confidence below 50.
* **Receipt OCR.** Parses OCR text into vendor, date (DD/MM/YYYY to ISO), NGN amount and VAT. A framework agnostic handler validates a base64 image, runs an injectable OCR engine (tesseract.js by default) and returns the parsed fields. An offline queue stores images taken without a connection and turns them into expenses once the device is back online.

## Layout

```
src/
  index.ts                     public exports
  lib/ai/
    categorizationService.ts   batch and single transaction categorisation
    transaction.ts             local Transaction interface
    providers/
      types.ts                 AIProvider and request/response types
      claude-provider.ts       Anthropic
      openai-provider.ts       OpenAI
      kimi-provider.ts         Moonshot Kimi (OpenAI compatible API)
      fallback-provider.ts     keyword rules, always available
      factory.ts               provider order and ProviderWithFallback
  lib/ocr/
    parse-receipt-text.ts      text to vendor, date, amount, VAT
    receipt-ocr.ts             OCR request handler and Tesseract engine
    ocr-queue.ts               offline queue with injected storage
tests/
  ai/                          providers, factory, fallback, service
  ocr/                         parser, handler, queue
```

## Install and test

Requires Node 20 or later.

```bash
npm install
npm run typecheck
npm test
```

Tests mock the vendor SDKs, the OCR engine and `fetch`, so they make no network calls and need no API keys. To use real providers, copy `.env.example` to `.env` and set the keys for the providers you want.

## How it was built

Built with AI coding agents under my direction; I set the architecture, reviewed the changes and own the result.

## License

MIT. See [LICENSE](LICENSE).
