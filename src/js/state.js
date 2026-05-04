export const APP_STORAGE_KEY = "tya.local.state.v1";

export const STATS = ["Fuerza", "Inteligencia", "Carisma", "Magnetismo"];

export const SPHERES = [
  { id: "corpomaterial", name: "corpomaterial", stat: "Fuerza", companion: "Segismundo", icon: "dumbbell" },
  { id: "intelectual", name: "intelectual", stat: "Inteligencia", companion: "Hagen", icon: "brain" },
  { id: "emocional", name: "emocional", stat: "Carisma", companion: "Din", icon: "heart" },
  { id: "sexocreativa", name: "sexocreativa", stat: "Magnetismo", companion: "Elektra", icon: "sparkles" }
];

export const CLASS_NAMES = [
  "Guerrero",
  "Berserker",
  "Paladin",
  "Picaro",
  "Cazador",
  "Bardo",
  "Mago",
  "Hechicero",
  "Brujo",
  "Sanador",
  "Monje",
  "Alquimista",
  "Invocador",
  "Psionico",
  "Artificiero"
];

const defaultFiles = {
  "memory.md": "# Memory\n\n- Piccolo represents the shared Epicurogotchi.\n- Campaigns should create concrete discoveries, actions, pleasures, experiments, or memories.\n",
  "assistants.md": "# Assistants Router\n\nUse heavy tasks for campaign architecture and repair, medium tasks for GM turns, and small tasks for validation and compaction.\n",
  "heavy_tasks.md": "# Heavy Tasks\n\n- Build act maps.\n- Repair campaign coherence.\n- Produce final recaps and durable memory deltas.\n",
  "medium_tasks.md": "# Medium Tasks\n\n- Generate GM turns.\n- Narrate consequences from code results.\n- Integrate selected rituals diegetically.\n",
  "small_tasks.md": "# Small Tasks\n\n- Validate required sections.\n- Extract challenge signals.\n- Compact recent turns.\n",
  "campaigns/active.md": "# Active Campaign\n\nNo active campaign yet.\n",
  "rituals/library.md": "# Ritual Library\n\nThe app state owns ritual records; this file is for notes.\n",
  "characters/vanaheim.md": "# Vanaheim Companions\n\nDin, Segismundo, Hagen, and Elektra track sphere growth.\n",
  "design/frontend_rules.md": "# Frontend Rules\n\nForged artifact UI, readable long text, tactical combat panel, visible Piccolo.\n"
};

const seedRituals = [
  {
    title: "Mano Leveleadora",
    description: "Practice a tiny precision action until it feels effortless, then record what got easier.",
    sphere: "corpomaterial",
    size: "micro",
    tone: "focused",
    difficulty: "normal",
    duration: "5-10 min",
    requiresProof: true,
    tags: ["precision", "body", "skill"],
    rewardBias: "clean execution"
  },
  {
    title: "Canto del Ciervo",
    description: "Make or capture one short sound, phrase, or voice-note that marks the scene as sovereign.",
    sphere: "emocional",
    size: "micro",
    tone: "tender",
    difficulty: "easy",
    duration: "3-8 min",
    requiresProof: true,
    tags: ["voice", "tenderness", "signal"],
    rewardBias: "attention lock"
  },
  {
    title: "Athanor del Juanete",
    description: "Prepare, taste, or plan one small material pleasure with deliberate attention.",
    sphere: "corpomaterial",
    size: "micro",
    tone: "sensory",
    difficulty: "easy",
    duration: "5-10 min",
    requiresProof: true,
    tags: ["food", "body", "material"],
    rewardBias: "vigor"
  },
  {
    title: "Hagen's Knot",
    description: "Solve a quick puzzle, read a compact idea, or produce one useful hypothesis for the campaign.",
    sphere: "intelectual",
    size: "micro",
    tone: "strategic",
    difficulty: "normal",
    duration: "5-10 min",
    requiresProof: true,
    tags: ["idea", "puzzle", "strategy"],
    rewardBias: "clarity"
  },
  {
    title: "Elektra's Forge",
    description: "Create a tiny aesthetic object, image, sentence, outfit idea, scene beat, or playful ritual token.",
    sphere: "sexocreativa",
    size: "micro",
    tone: "aesthetic",
    difficulty: "normal",
    duration: "5-10 min",
    requiresProof: true,
    tags: ["creation", "style", "ritual"],
    rewardBias: "resonance"
  },
  {
    title: "Multiversus Opulentus",
    description: "Build a daily tribute that makes the Monarca feel rare, memorable, and intensely seen.",
    sphere: "emocional",
    size: "macro",
    tone: "ceremonial",
    difficulty: "hard",
    duration: "20-45 min",
    requiresProof: true,
    tags: ["daily", "tribute", "bond"],
    rewardBias: "relationship level"
  },
  {
    title: "Hyperionte",
    description: "Find or design something that could genuinely please the Monarca and test its promise.",
    sphere: "intelectual",
    size: "macro",
    tone: "investigative",
    difficulty: "hard",
    duration: "30-60 min",
    requiresProof: true,
    tags: ["discovery", "roleplay", "research"],
    rewardBias: "new conjecture"
  },
  {
    title: "Fanete no Tabemono",
    description: "Turn a meal, ingredient, restaurant, or taste memory into a mindful adventure record.",
    sphere: "corpomaterial",
    size: "macro",
    tone: "sensory",
    difficulty: "normal",
    duration: "30-60 min",
    requiresProof: true,
    tags: ["food", "place", "memory"],
    rewardBias: "material pleasure"
  },
  {
    title: "Saturnalia Deftera",
    description: "Try something not yet proven by the shared mind and report the most interesting residue.",
    sphere: "sexocreativa",
    size: "macro",
    tone: "experimental",
    difficulty: "hard",
    duration: "30-90 min",
    requiresProof: true,
    tags: ["new", "experiment", "creation"],
    rewardBias: "expanded network"
  }
];

export function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createInitialState() {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    campaigns: [],
    activeCampaignId: null,
    characters: {
      juanete: null,
      ironmole: null,
      vanaheim: {
        din: { name: "Din de Vanaheim", sphere: "emocional", level: 1, notes: "Tenderness, closeness, emotional resonance." },
        segismundo: { name: "Segismundo de Vanaheim", sphere: "corpomaterial", level: 1, notes: "Body, food, place, material pleasure." },
        hagen: { name: "Hagen de Vanaheim", sphere: "intelectual", level: 1, notes: "Thought, games, strategy, curiosity." },
        elektra: { name: "Elektra de Vanaheim", sphere: "sexocreativa", level: 1, notes: "Ritual, aesthetics, creative desire." }
      }
    },
    ritualPools: seedRituals.map((ritual) => ({ ...ritual, id: uid("ritual"), createdAt: now })),
    epicurogotchis: [
      {
        id: "piccolo",
        name: "Piccolo",
        level: 1,
        form: "First Ember Vessel",
        image: "./src/assets/piccolo-epicurogotchi.png",
        discoveries: [],
        formHistory: [
          { level: 1, form: "First Ember Vessel", note: "The shared Epicurogotchi awakens." }
        ]
      }
    ],
    activeEpicurogotchiId: "piccolo",
    llmRuns: [],
    memories: deepClone(defaultFiles),
    settings: {
      modelTier: "medium",
      llmMode: "generate-content",
      thinkingLevel: "high",
      thinkingBudget: 16000,
      temperature: 0.85,
      maxOutputTokens: 20000,
      toneGate: "adult-symbolic",
      combatWeight: 80,
      llmEndpoint: "",
      explicitMatureMode: true
    }
  };
}

export function ensureState(candidate) {
  const base = createInitialState();
  if (!candidate || typeof candidate !== "object") {
    return base;
  }
  return {
    ...base,
    ...candidate,
    characters: {
      ...base.characters,
      ...(candidate.characters || {}),
      vanaheim: {
        ...base.characters.vanaheim,
        ...((candidate.characters || {}).vanaheim || {})
      }
    },
    ritualPools: Array.isArray(candidate.ritualPools) && candidate.ritualPools.length ? candidate.ritualPools : base.ritualPools,
    epicurogotchis: Array.isArray(candidate.epicurogotchis) && candidate.epicurogotchis.length ? candidate.epicurogotchis : base.epicurogotchis,
    llmRuns: Array.isArray(candidate.llmRuns) ? candidate.llmRuns : base.llmRuns,
    memories: {
      ...base.memories,
      ...(candidate.memories || {})
    },
    settings: {
      ...base.settings,
      ...(candidate.settings || {})
    }
  };
}

export function getActiveCampaign(state) {
  return state.campaigns.find((campaign) => campaign.id === state.activeCampaignId) || null;
}

export function getActiveEpicurogotchi(state) {
  return state.epicurogotchis.find((pet) => pet.id === state.activeEpicurogotchiId) || state.epicurogotchis[0];
}

export function touchState(state) {
  state.updatedAt = new Date().toISOString();
  return state;
}
