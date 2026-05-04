import { ensureState } from "./state.js";
import { downloadJson, readJsonFile } from "./storage.js";

export function exportBundle(state) {
  const stamp = new Date().toISOString().slice(0, 10);
  downloadJson(`totumas-aventuras-${stamp}.json`, state);
}

export async function importBundle(file) {
  const parsed = await readJsonFile(file);
  return ensureState(parsed);
}
