import { SPHERES, STATS, uid } from "./state.js";

export const CLASS_TABLE = {
  Guerrero: { Fuerza: 15, Inteligencia: 9, Carisma: 12, Magnetismo: 12, resource: "Guardia", tendency: "frontline control" },
  Berserker: { Fuerza: 16, Inteligencia: 8, Carisma: 11, Magnetismo: 13, resource: "Furia", tendency: "burst damage" },
  Paladin: { Fuerza: 14, Inteligencia: 10, Carisma: 14, Magnetismo: 11, resource: "Voto", tendency: "protection and pressure" },
  Picaro: { Fuerza: 11, Inteligencia: 13, Carisma: 12, Magnetismo: 14, resource: "Ventaja", tendency: "precision and tricks" },
  Cazador: { Fuerza: 13, Inteligencia: 13, Carisma: 10, Magnetismo: 12, resource: "Marca", tendency: "tracking and ranged tempo" },
  Bardo: { Fuerza: 9, Inteligencia: 12, Carisma: 16, Magnetismo: 14, resource: "Canto", tendency: "buffs and social turns" },
  Mago: { Fuerza: 8, Inteligencia: 16, Carisma: 11, Magnetismo: 13, resource: "Formula", tendency: "arcane control" },
  Hechicero: { Fuerza: 9, Inteligencia: 13, Carisma: 13, Magnetismo: 16, resource: "Pulso", tendency: "volatile spellcraft" },
  Brujo: { Fuerza: 8, Inteligencia: 13, Carisma: 14, Magnetismo: 16, resource: "Pacto", tendency: "risky bargains" },
  Sanador: { Fuerza: 9, Inteligencia: 13, Carisma: 15, Magnetismo: 12, resource: "Gracia", tendency: "recovery and vows" },
  Monje: { Fuerza: 13, Inteligencia: 12, Carisma: 11, Magnetismo: 14, resource: "Ritmo", tendency: "tempo and discipline" },
  Alquimista: { Fuerza: 10, Inteligencia: 15, Carisma: 11, Magnetismo: 13, resource: "Reactivo", tendency: "conversion and utility" },
  Invocador: { Fuerza: 8, Inteligencia: 14, Carisma: 13, Magnetismo: 15, resource: "Vinculo", tendency: "companions and summons" },
  Psionico: { Fuerza: 9, Inteligencia: 15, Carisma: 12, Magnetismo: 14, resource: "Foco", tendency: "mind pressure" },
  Artificiero: { Fuerza: 11, Inteligencia: 15, Carisma: 10, Magnetismo: 13, resource: "Modulo", tendency: "devices and traps" }
};

export const DIFFICULTY_TARGETS = {
  easy: [8, 10],
  normal: [11, 13],
  hard: [14, 16],
  boss: [17, 18],
  mythic: [19, 20]
};

export function buildCharacter(name, className, level = 1) {
  const profile = CLASS_TABLE[className] || CLASS_TABLE.Guerrero;
  const stats = Object.fromEntries(STATS.map((stat) => [stat, profile[stat] + Math.floor((level - 1) / 4)]));
  return {
    id: name.toLowerCase(),
    name,
    className,
    level,
    hp: 20 + stats.Fuerza,
    maxHp: 20 + stats.Fuerza,
    stats,
    resource: profile.resource,
    tendency: profile.tendency,
    items: [],
    abilities: []
  };
}

export function modifierFor(value) {
  return Math.floor((Number(value) - 10) / 2);
}

export function phaseFromTurn(turnNumber, maxTurns) {
  if (turnNumber <= 0) return "setup";
  const ratio = turnNumber / Math.max(1, maxTurns);
  if (ratio <= 0.2) return "act1";
  if (ratio <= 0.7) return "act2";
  if (ratio < 1) return "act3";
  return "epilogue";
}

export function targetForDifficulty(difficultyBand, turnNumber = 1) {
  const range = DIFFICULTY_TARGETS[difficultyBand] || DIFFICULTY_TARGETS.normal;
  const offset = turnNumber % (range[1] - range[0] + 1);
  return range[0] + offset;
}

export function sphereForStat(stat) {
  return SPHERES.find((sphere) => sphere.stat === stat) || SPHERES[0];
}

export function selectRitual(state, options = {}) {
  const size = options.size || "micro";
  const sphere = options.sphere || null;
  const avoidIds = new Set(options.avoidIds || []);
  const pool = state.ritualPools.filter((ritual) => {
    const sizeMatches = ritual.size === size;
    const sphereMatches = !sphere || ritual.sphere === sphere;
    return sizeMatches && sphereMatches && !avoidIds.has(ritual.id);
  });
  const fallbackPool = state.ritualPools.filter((ritual) => ritual.size === size && !avoidIds.has(ritual.id));
  const source = pool.length ? pool : fallbackPool;
  if (!source.length) {
    return {
      id: uid("joker_ritual"),
      title: "Joker Ritual",
      description: "Ask the GM to create a simple diegetic ritual from the current scene and Epicurogotchi context.",
      sphere: sphere || "emocional",
      size,
      tone: "contextual",
      difficulty: size === "macro" ? "hard" : "normal",
      duration: size === "macro" ? "15-45 min" : "5-10 min",
      requiresProof: true,
      tags: ["joker", "context"],
      rewardBias: "adaptive"
    };
  }
  const rewardNeed = String(options.rewardBias || options.rewardIntent || "").toLowerCase();
  const tagNeed = new Set((options.tags || []).map((tag) => String(tag).toLowerCase()));
  const scored = source.map((ritual) => {
    const tags = (ritual.tags || []).map((tag) => String(tag).toLowerCase());
    const tagScore = tags.filter((tag) => tagNeed.has(tag) || rewardNeed.includes(tag)).length;
    const rewardScore = ritual.rewardBias && rewardNeed.includes(String(ritual.rewardBias).toLowerCase()) ? 2 : 0;
    const difficultyScore = options.difficulty && ritual.difficulty === options.difficulty ? 1 : 0;
    return { ritual, score: tagScore + rewardScore + difficultyScore };
  }).sort((a, b) => b.score - a.score);
  const bestScore = scored[0]?.score || 0;
  const best = bestScore > 0 ? scored.filter((item) => item.score === bestScore).map((item) => item.ritual) : source;
  return best[Math.floor(Math.random() * best.length)];
}

export function createEncounter(state, campaign, overrides = {}) {
  const turnNumber = campaign.turnNumber || 0;
  const isBoss = overrides.scale === "boss" || turnNumber >= Math.floor(campaign.maxTurns * 0.75);
  const difficultyBand = overrides.difficultyBand || (isBoss ? "boss" : turnNumber > 10 ? "hard" : "normal");
  const primaryStat = overrides.primaryStat || STATS[turnNumber % STATS.length];
  const sphere = sphereForStat(primaryStat);
  const ritualSize = isBoss ? "macro" : "micro";
  const usedRitualIds = campaign.turns.flatMap((turn) => turn.activeOutGameMission?.ritual?.id ? [turn.activeOutGameMission.ritual.id] : []);
  const ritual = overrides.ritual || selectRitual(state, { size: ritualSize, sphere: sphere.id, avoidIds: usedRitualIds, rewardIntent: overrides.rewardIntent, difficulty: difficultyBand });
  const target = targetForDifficulty(difficultyBand, turnNumber + 1);
  return {
    id: uid("encounter"),
    type: isBoss ? "boss" : "combat",
    status: "active",
    title: overrides.title || (isBoss ? "Boss Gate of Vanaheim" : "Ember Skirmish"),
    objective: overrides.objective || "Break the threat and turn its residue into useful relationship fuel.",
    enemies: overrides.enemies || [
      { id: uid("enemy"), name: isBoss ? "Abyssal Gatekeeper" : "Ash-Husk Raider", hp: isBoss ? 32 : 14, maxHp: isBoss ? 32 : 14, condition: "ready" }
    ],
    challengeSignal: {
      challengeType: isBoss ? "boss" : "combat",
      difficultyBand,
      primaryStat,
      stakes: isBoss ? "campaign-critical" : "medium",
      requiresOutGame: true,
      ritualSize
    },
    target,
    minigame: {
      type: "score-challenge",
      status: "pending",
      score: null,
      resultLabel: null
    },
    combatState: {
      round: 1,
      threatClock: isBoss ? 6 : 4,
      enemyIntent: overrides.enemyIntent || (isBoss ? "Cerrar el boss gate y castigar errores." : "Forzar una mala posicion y drenar HP."),
      allyActions: [],
      pendingResolution: true,
      battleLog: []
    },
    ritual
  };
}

export function resultLabelForScore(score) {
  if (score >= 20) return "perfect roll";
  if (score >= 15) return "strong success";
  if (score >= 10) return "mixed success";
  if (score >= 2) return "failure with cost";
  return "comic complication";
}

export function scoreFromTimingPercent(percent) {
  const distance = Math.abs(percent - 50);
  const raw = Math.max(1, Math.round(20 - distance / 2.65));
  return Math.min(20, raw);
}

export function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}
