import { uid } from "./state.js";

export function addDiscovery(pet, data) {
  const discovery = {
    id: uid("discovery"),
    title: data.title?.trim() || "Untitled Enjuanetado",
    sphere: data.sphere || "emocional",
    note: data.note?.trim() || "",
    ritualSize: data.ritualSize || "micro",
    createdAt: new Date().toISOString()
  };
  pet.discoveries.unshift(discovery);
  return discovery;
}

export function levelUp(pet, amount = 1) {
  const nextLevel = pet.level + Number(amount || 1);
  if (nextLevel > 99) {
    pet.level = Math.max(1, nextLevel - 99);
    pet.form = `New Form ${pet.formHistory.length + 1}`;
    pet.formHistory.unshift({
      level: pet.level,
      form: pet.form,
      note: "Piccolo crossed level 99 and returned in a new form."
    });
  } else {
    pet.level = nextLevel;
  }
  return pet.level;
}

export function setPetImageFromFile(pet, file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      pet.image = String(reader.result);
      resolve(pet.image);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
