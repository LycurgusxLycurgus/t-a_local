import { GM_TURN_SCHEMA, buildSystemInstruction } from "./prompts.js";
import { GEMINI_MODES, fallbackModelsForTier, modelForTier, modelTierOptions, routeForTier } from "./llmConfig.js";

export { GEMINI_MODES, modelForTier };
export const GEMINI_MODEL_TIERS = modelTierOptions();

export function extractGeminiText(payload, mode) {
  if (mode === "interactions") {
    const outputs = Array.isArray(payload?.outputs) ? payload.outputs : [];
    return outputs
      .filter((output) => output?.type === "text" && output.text)
      .map((output) => output.text)
      .join("\n")
      .trim();
  }
  return payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim() || "";
}

function toGeminiResponseSchema(schema) {
  if (Array.isArray(schema)) return schema.map(toGeminiResponseSchema);
  if (!schema || typeof schema !== "object") return schema;
  const next = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "additionalProperties") continue;
    next[key] = toGeminiResponseSchema(value);
  }
  return next;
}

export async function callGemini({ prompt, settings, apiKey }) {
  const mode = settings.llmMode || "generate-content";
  const route = routeForTier(settings.modelTier);
  const model = modelForTier(settings.modelTier);
  const systemInstruction = buildSystemInstruction();
  const endpoint = settings.llmEndpoint || (window.location.port === "8787" ? "/api/gemini" : "");

  if (endpoint) {
    return callProxyEndpoint({ prompt, settings: { ...route, ...settings, llmEndpoint: endpoint }, model, systemInstruction });
  }

  if (!apiKey) {
    throw new Error("Gemini API key is required for direct browser calls.");
  }

  if (mode === "interactions") {
    return callGeminiInteractions({ prompt, settings, apiKey, model, systemInstruction });
  }

  return callGeminiGenerateContent({ prompt, settings, apiKey, model, systemInstruction });
}

async function callProxyEndpoint({ prompt, settings, model, systemInstruction }) {
  const response = await fetch(settings.llmEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "gemini",
      mode: settings.llmMode || "generate-content",
      model,
      fallbackModels: fallbackModelsForTier(settings.modelTier),
      prompt,
      systemInstruction,
      responseJsonSchema: GM_TURN_SCHEMA,
      generation: {
        thinkingLevel: settings.thinkingLevel || routeForTier(settings.modelTier).thinkingLevel,
        thinkingBudget: settings.thinkingBudget || routeForTier(settings.modelTier).thinkingBudget,
        temperature: settings.temperature || routeForTier(settings.modelTier).temperature,
        maxOutputTokens: Number(settings.maxOutputTokens || routeForTier(settings.modelTier).maxOutputTokens)
      }
    })
  });
  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload?.error ? `: ${payload.error}` : "";
    } catch {}
    throw new Error(`Proxy request failed: ${response.status}${detail}`);
  }
  const payload = await response.json();
  return {
    mode: "proxy",
    model,
    payload,
    text: payload.text || payload.visibleTurnText || JSON.stringify(payload)
  };
}

async function callGeminiGenerateContent({ prompt, settings, apiKey, model, systemInstruction }) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        ...(model.startsWith("gemini-2.5") ? { responseJsonSchema: GM_TURN_SCHEMA } : { responseSchema: toGeminiResponseSchema(GM_TURN_SCHEMA) }),
        thinkingConfig: {
          ...(model.startsWith("gemini-2.5")
            ? { thinkingBudget: Number(settings.thinkingBudget || routeForTier(settings.modelTier).thinkingBudget || 16000) }
            : { thinkingLevel: settings.thinkingLevel || routeForTier(settings.modelTier).thinkingLevel || "high" })
        },
        temperature: Number(settings.temperature || routeForTier(settings.modelTier).temperature || 0.85),
        maxOutputTokens: Number(settings.maxOutputTokens || routeForTier(settings.modelTier).maxOutputTokens || 20000)
      }
    })
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Gemini request failed: ${response.status}`);
  }
  return {
    mode: "generate-content",
    model,
    payload,
    text: extractGeminiText(payload, "generate-content")
  };
}

async function callGeminiInteractions({ prompt, settings, apiKey, model, systemInstruction }) {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      model,
      store: false,
      system_instruction: systemInstruction,
      input: prompt,
      generation_config: {
        thinking_level: settings.thinkingLevel || "low",
        max_output_tokens: Number(settings.maxOutputTokens || 2400)
      }
    })
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Gemini interaction failed: ${response.status}`);
  }
  return {
    mode: "interactions",
    model,
    payload,
    text: extractGeminiText(payload, "interactions")
  };
}
