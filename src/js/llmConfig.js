export const LLM_ROUTES = {
  heavy: {
    label: "Heavy - Gemini 2.5 Pro",
    model: "gemini-2.5-pro",
    fallbackModels: ["gemini-3.1-pro-preview", "gemini-2.5-flash", "gemini-2.5-flash-lite"],
    thinkingBudget: 16000,
    temperature: 0.85,
    maxOutputTokens: 20000
  },
  medium: {
    label: "Medium - Gemini 3 Flash",
    model: "gemini-3-flash-preview",
    fallbackModels: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
    thinkingLevel: "high",
    temperature: 0.85,
    maxOutputTokens: 20000
  },
  small: {
    label: "Small - Gemini 3.1 Flash-Lite",
    model: "gemini-3.1-flash-lite-preview",
    fallbackModels: ["gemini-2.5-flash-lite", "gemini-2.5-flash"],
    thinkingLevel: "high",
    temperature: 0.85,
    maxOutputTokens: 20000
  }
};

export const DEFAULT_LLM_ROUTE = "medium";

export const GEMINI_MODES = [
  { value: "generate-content", label: "Stable generateContent" },
  { value: "interactions", label: "Interactions beta" }
];

export function routeForTier(tier) {
  return LLM_ROUTES[tier] || LLM_ROUTES[DEFAULT_LLM_ROUTE];
}

export function modelForTier(tier) {
  return routeForTier(tier).model;
}

export function fallbackModelsForTier(tier) {
  return routeForTier(tier).fallbackModels || [];
}

export function modelTierOptions() {
  return Object.entries(LLM_ROUTES).map(([value, route]) => ({
    value,
    label: route.label
  }));
}
