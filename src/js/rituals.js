import { uid } from "./state.js";

export function addRitual(state, data) {
  const ritual = {
    id: uid("ritual"),
    title: data.title?.trim() || "Untitled Ritual",
    description: data.description?.trim() || "No description yet.",
    sphere: data.sphere || "emocional",
    size: data.size || "micro",
    tone: data.tone?.trim() || "focused",
    difficulty: data.difficulty || "normal",
    duration: data.duration?.trim() || (data.size === "macro" ? "15-60 min" : "1-10 min"),
    requiresProof: Boolean(data.requiresProof),
    tags: String(data.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean),
    rewardBias: data.rewardBias?.trim() || "resonance",
    createdAt: new Date().toISOString()
  };
  state.ritualPools.unshift(ritual);
  return ritual;
}

export function deleteRitual(state, ritualId) {
  state.ritualPools = state.ritualPools.filter((ritual) => ritual.id !== ritualId);
}

export function ritualStats(state) {
  return state.ritualPools.reduce((acc, ritual) => {
    acc.total += 1;
    acc[ritual.size] = (acc[ritual.size] || 0) + 1;
    acc[ritual.sphere] = (acc[ritual.sphere] || 0) + 1;
    return acc;
  }, { total: 0, micro: 0, macro: 0 });
}
