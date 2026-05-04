# Totumas & Aventuras LLM Config

Runtime source of truth: `src/js/llmConfig.js`.

The app reads model routes from code so the browser UI and local proxy stay aligned. Edit `src/js/llmConfig.js` when changing models, fallbacks, thinking, or token budgets.

## Current Routes

| Route | Model | Fallbacks | Thinking | Max Output |
| --- | --- | --- | --- | --- |
| `medium` | `gemini-3-flash-preview` | `gemini-2.5-flash`, `gemini-2.5-flash-lite` | `high` | `20000` |
| `heavy` | `gemini-2.5-pro` | `gemini-3.1-pro-preview`, `gemini-2.5-flash`, `gemini-2.5-flash-lite` | `thinkingBudget: 16000` | `20000` |
| `small` | `gemini-3.1-flash-lite-preview` | `gemini-2.5-flash-lite`, `gemini-2.5-flash` | `high` | `20000` |

All routes use `temperature: 0.85`.

## Proxy Behavior

`server.mjs` tries the selected model first, then route fallbacks.

If Gemini returns `Thinking level is not supported for this model`, the proxy retries the same model without `thinkingConfig` before moving to the next fallback.

The default route is `medium`, which uses Gemini 3 Flash first and only falls back to 2.5 Flash if the preview model is unavailable or rate limited.
