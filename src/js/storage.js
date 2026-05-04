import { APP_STORAGE_KEY, ensureState, touchState } from "./state.js";

export function loadState() {
  try {
    const raw = window.localStorage.getItem(APP_STORAGE_KEY);
    return ensureState(raw ? JSON.parse(raw) : null);
  } catch (error) {
    console.warn("Failed to load TyA state", error);
    return ensureState(null);
  }
}

export function saveState(state) {
  touchState(state);
  window.localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(state));
}

export function resetStoredState() {
  window.localStorage.removeItem(APP_STORAGE_KEY);
}

export function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
