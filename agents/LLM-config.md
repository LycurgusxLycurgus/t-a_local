# Totumas & Aventuras LLM Config

Runtime source of truth: `src/js/llmConfig.js`.

The app reads model routes from code so the browser UI and local proxy stay aligned. Edit `src/js/llmConfig.js` when changing models, fallbacks, thinking, or token budgets.

## Current Routes

| Route | Model | Fallbacks | Thinking | Max Output |
| --- | --- | --- | --- | --- |
| `heavy` | `gemini-3-flash-preview` | `gemini-3.1-flash-lite-preview` | primary `high`, fallback `high` | `20000` |
| `medium` | `gemini-3.1-flash-lite-preview` | none | `high` | `20000` |
| `small` | `gemini-3.1-flash-lite-preview` | none | `medium` | `20000` |

All routes use `temperature: 0.85`.

## Proxy Behavior

`server.mjs` tries the selected model first, then route fallbacks.

If Gemini returns `Thinking level is not supported for this model`, the proxy retries the same model without `thinkingConfig` before moving to the next fallback.

The default route is `medium`, which uses Gemini 3.1 Flash-Lite with high thinking. Automated campaign seed generation uses `small`; campaign map creation uses `heavy`; ordinary GM turns use `medium`. The heavy route spends the limited Gemini 3 Flash daily quota first, then falls back to Gemini 3.1 Flash-Lite. Bridgecrux records whether a fallback was used and shows the fallback-specific thinking config returned by the proxy.
