import { buildCharacter, createEncounter, phaseFromTurn, resultLabelForScore } from "./rules.js";
import { uid } from "./state.js";

export function createCampaign(state, formData) {
  const now = new Date().toISOString();
  const maxTurns = Number(formData.maxTurns || 20);
  const campaign = {
    id: uid("campaign"),
    title: formData.title?.trim() || "The First Totuma",
    mode: formData.mode || "canon",
    status: "active",
    turnNumber: 0,
    maxTurns,
    phase: "epicurogotchi",
    combatWeight: Number(formData.combatWeight || 80),
    intensity: formData.intensity || "normal",
    seed: formData.seed?.trim() || "",
    selectedClasses: {
      juanete: formData.juaneteClass || "Bardo",
      ironmole: formData.ironmoleClass || "Artificiero"
    },
    mandatoryRitualIds: Array.isArray(formData.mandatoryRitualIds) ? formData.mandatoryRitualIds : [],
    generatedRoles: {
      juanete: "Awaiting GM subclass and campaign-specific talents.",
      ironmole: "Awaiting GM subclass and campaign-specific talents.",
      vanaheim: "Din, Segismundo, Hagen, and Elektra are available as sphere companions."
    },
    actMap: buildActMap(maxTurns, formData.intensity || "normal"),
    campaignMap: null,
    campaignMapStatus: "pending",
    turns: [],
    activeEncounter: null,
    activeOutGameMission: null,
    currentTurnDraft: null,
    loot: [],
    recap: "",
    memoryDelta: "",
    mechanicalResults: {},
    createdAt: now,
    updatedAt: now
  };
  state.characters.juanete = buildCharacter("Juanete", campaign.selectedClasses.juanete);
  state.characters.ironmole = buildCharacter("Ironmole", campaign.selectedClasses.ironmole);
  state.campaigns.unshift(campaign);
  state.activeCampaignId = campaign.id;
  state.memories["campaigns/active.md"] = `# ${campaign.title}\n\nMode: ${campaign.mode}\nTurns: 0/${campaign.maxTurns}\n\nSeed:\n${campaign.seed || "No seed yet."}\n`;
  return campaign;
}

export function buildActMap(maxTurns = 20, intensity = "normal") {
  return [
    { act: "Turn 0", range: "0", purpose: "Setup, roles, first omen, Piccolo ignition." },
    { act: "Act I", range: `1-${Math.max(4, Math.round(maxTurns * 0.2))}`, purpose: "Entry, first combat, first proof of sphere pressure." },
    { act: "Act II", range: `${Math.max(5, Math.round(maxTurns * 0.2) + 1)}-${Math.round(maxTurns * 0.7)}`, purpose: intensity === "boss-heavy" ? "Repeated tactical gates and mid bosses." : "Combats, complications, discoveries, ritual load." },
    { act: "Act III", range: `${Math.round(maxTurns * 0.7) + 1}-${maxTurns}`, purpose: "Convergence, final boss, loot, Epicurogotchi level up." }
  ];
}

export function openEncounter(state, campaign, overrides = {}) {
  const encounter = createEncounter(state, campaign, overrides);
  campaign.activeEncounter = encounter;
  campaign.activeOutGameMission = {
    id: uid("mission"),
    status: "required",
    completed: false,
    proofNote: "",
    ritual: encounter.ritual,
    createdAt: new Date().toISOString()
  };
  campaign.mechanicalResults = {
    ...campaign.mechanicalResults,
    pendingEncounter: encounter.title,
    target: encounter.target,
    primaryStat: encounter.challengeSignal.primaryStat,
    ritualRequired: encounter.ritual.title
  };
  return encounter;
}

export function completeActiveRitual(campaign, proofNote) {
  if (!campaign.activeOutGameMission) return false;
  campaign.activeOutGameMission.completed = true;
  campaign.activeOutGameMission.proofNote = proofNote || "Completed at the table.";
  campaign.activeOutGameMission.completedAt = new Date().toISOString();
  campaign.mechanicalResults = {
    ...campaign.mechanicalResults,
    ritualCompleted: campaign.activeOutGameMission.ritual.title,
    ritualProof: campaign.activeOutGameMission.proofNote
  };
  return true;
}

export function registerScore(campaign, score) {
  if (!campaign.activeEncounter) return null;
  const resultLabel = resultLabelForScore(score);
  campaign.activeEncounter.minigame = {
    ...campaign.activeEncounter.minigame,
    status: "completed",
    score,
    resultLabel
  };
  campaign.mechanicalResults = {
    ...campaign.mechanicalResults,
    scoreChallenge: {
      score,
      resultLabel,
      target: campaign.activeEncounter.target,
      primaryStat: campaign.activeEncounter.challengeSignal.primaryStat
    }
  };
  return campaign.activeEncounter.minigame;
}

export function canAdvanceTurn(campaign) {
  const mission = campaign.activeOutGameMission;
  if (mission?.status === "required" && !mission.completed) {
    return { ok: false, reason: "A required out-game mission is still incomplete." };
  }
  return { ok: true, reason: "" };
}

export function commitTurn(campaign, payload) {
  const gate = canAdvanceTurn(campaign);
  if (!gate.ok) {
    return gate;
  }
  const now = new Date().toISOString();
  const turnRecord = {
    id: uid("turn"),
    turnNumber: campaign.turnNumber,
    playerActions: payload.playerActions || "",
    visibleTurnText: payload.visibleTurnText || "",
    gmPayload: payload.gmPayload || null,
    challengeSignal: payload.challengeSignal || campaign.activeEncounter?.challengeSignal || null,
    stateDeltaProposal: payload.stateDeltaProposal || null,
    activeEncounter: campaign.activeEncounter,
    activeOutGameMission: campaign.activeOutGameMission,
    mechanicalResults: campaign.mechanicalResults,
    createdAt: now
  };
  campaign.turns.push(turnRecord);
  campaign.turnNumber = Math.min(campaign.maxTurns, campaign.turnNumber + 1);
  campaign.phase = phaseFromTurn(campaign.turnNumber, campaign.maxTurns);
  campaign.updatedAt = now;
  campaign.activeEncounter = null;
  campaign.activeOutGameMission = null;
  campaign.mechanicalResults = {};
  campaign.currentTurnDraft = null;
  if (campaign.turnNumber >= campaign.maxTurns) {
    campaign.status = "epilogue";
  }
  return { ok: true, turn: turnRecord };
}

function ritualFromPayload(payload) {
  const request = payload?.ritualRequest || {};
  const signal = payload?.challengeSignal || {};
  const title = request.title || request.name || request.ritualTitle || "";
  const description = request.description || request.proof || request.prompt || "";
  if (!title && !signal.requiresOutGame) return null;
  return {
    id: uid("ritual"),
    title: title || "Required Table Proof",
    description: description || "Complete the diegetic out-game proof before resolving the in-game action.",
    sphere: request.sphere || signal.primaryStat || "emocional",
    size: request.size || signal.ritualSize || "micro",
    tone: request.tone || "diegetic",
    difficulty: request.difficulty || signal.difficultyBand || "normal",
    duration: request.duration || "table proof",
    requiresProof: true,
    tags: Array.isArray(request.tags) ? request.tags : ["gm", "required"],
    rewardBias: request.rewardBias || "turn gate"
  };
}

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function extractSection(text, label, nextLabels = []) {
  const source = String(text || "");
  const start = source.search(new RegExp(label.replace(/\s+/g, "\\s+"), "i"));
  if (start < 0) return "";
  const contentStart = start + label.length;
  const next = nextLabels
    .map((nextLabel) => {
      const match = source.slice(contentStart).search(new RegExp(nextLabel.replace(/\s+/g, "\\s+"), "i"));
      return match < 0 ? -1 : contentStart + match;
    })
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0] ?? source.length;
  return source.slice(contentStart, next).replace(/^[:\s]+/, "").trim();
}

function optionLinesToObjects(text, actor) {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/(\d+[\).\:])/g, "\n$1")
    .split("\n")
    .map((line) => line.trim().replace(/^\d+[\).\:]\s*/, "").replace(/^[-•]\s*/, ""))
    .filter(Boolean);
  return normalized.slice(0, 3).map((label, index) => ({
    id: `${actor}-${index + 1}`,
    label,
    stat: "",
    intent: label
  }));
}

function defaultActionOptions(signal = {}) {
  const stat = signal.primaryStat || "";
  const type = signal.challengeType || "scene";
  return {
    juanete: [
      {
        id: "juanete-1",
        label: type === "combat" || type === "boss" ? "Presionar el peligro principal" : "Leer la escena y abrir una ventaja",
        stat,
        intent: "Convertir la narracion del GM en una accion concreta de Juanete."
      },
      {
        id: "juanete-2",
        label: "Proteger a Ironmole y sostener el ritmo",
        stat: "Carisma",
        intent: "Usar presencia, canto o decision para cuidar el turno compartido."
      }
    ],
    ironmole: [
      {
        id: "ironmole-1",
        label: type === "combat" || type === "boss" ? "Buscar el punto debil tactico" : "Analizar el mecanismo de la escena",
        stat: "Inteligencia",
        intent: "Crear una solucion tecnica o tactica para avanzar."
      },
      {
        id: "ironmole-2",
        label: "Preparar una herramienta o trampa",
        stat: "Fuerza",
        intent: "Poner el entorno al servicio de la accion."
      }
    ]
  };
}

function deriveActionOptions(visibleTurnText) {
  const actionText = extractSection(visibleTurnText, "ACCIONES POSIBLES", ["MECANICA"]);
  if (!actionText) return null;
  const normalized = normalizeText(actionText);
  const ironmoleIndex = normalized.indexOf("IRONMOLE");
  const juaneteIndex = normalized.indexOf("JUANETE");
  if (juaneteIndex < 0 || ironmoleIndex < 0) return null;
  const juaneteText = actionText
    .slice(juaneteIndex + "Juanete".length, ironmoleIndex)
    .replace(/^[:\s]+/, "");
  const ironmoleText = actionText
    .slice(ironmoleIndex + "Ironmole".length)
    .replace(/^[:\s]+/, "");
  const actionOptions = {
    juanete: optionLinesToObjects(juaneteText, "juanete"),
    ironmole: optionLinesToObjects(ironmoleText, "ironmole")
  };
  return actionOptions.juanete.length || actionOptions.ironmole.length ? actionOptions : null;
}

function deriveRitualRequest(visibleTurnText, signal = {}) {
  if (!signal.requiresOutGame) return null;
  const outGameText = extractSection(visibleTurnText, "OUT-GAME", ["ACCIONES POSIBLES", "MECANICA"]);
  if (!outGameText) return null;
  const [rawTitle, ...rest] = outGameText.split(":");
  const title = rest.length ? rawTitle.trim() : "Required Table Proof";
  const description = rest.length ? rest.join(":").trim() : outGameText;
  return {
    title,
    description,
    sphere: signal.primaryStat || "emocional",
    size: signal.ritualSize || "micro",
    proofPrompt: description
  };
}

function repairGmPayload(payload, visibleTurnText) {
  if (!payload || typeof payload !== "object") return payload;
  if (!payload.actionOptions?.juanete?.length || !payload.actionOptions?.ironmole?.length) {
    const derived = deriveActionOptions(visibleTurnText) || defaultActionOptions(payload.challengeSignal);
    payload.actionOptions = {
      juanete: payload.actionOptions?.juanete?.length ? payload.actionOptions.juanete : derived.juanete,
      ironmole: payload.actionOptions?.ironmole?.length ? payload.actionOptions.ironmole : derived.ironmole
    };
  }
  if (["combat", "boss"].includes(payload.challengeSignal?.challengeType) && !payload.ritualRequest?.title) {
    const derivedRitual = deriveRitualRequest(visibleTurnText, payload.challengeSignal);
    if (derivedRitual) payload.ritualRequest = derivedRitual;
  }
  return payload;
}

export function setCurrentTurnDraft(state, campaign, validation, rawText = "") {
  const now = new Date().toISOString();
  const payload = repairGmPayload(validation.payload, validation.visibleTurnText);
  const signal = payload?.challengeSignal || {};
  const plannedTurn = campaign.campaignMap?.turnPlan?.find((item) => Number(item.turn) === Number(campaign.turnNumber)) || null;
  const opensCombat = ["combat", "boss"].includes(signal.challengeType);
  const plannedRitual = plannedTurn?.ritualId ? state.ritualPools.find((ritual) => ritual.id === plannedTurn.ritualId) : null;
  const encounter = opensCombat ? createEncounter(state, campaign, {
    scale: signal.challengeType === "boss" ? "boss" : "skirmish",
    difficultyBand: plannedTurn?.difficultyBand || signal.difficultyBand,
    primaryStat: plannedTurn?.primaryStat || signal.primaryStat,
    ritual: plannedRitual || undefined,
    rewardIntent: plannedTurn?.rewardIntent || plannedTurn?.rewardHint,
    enemyIntent: plannedTurn?.enemyIntent,
    enemies: normalizeEnemies(payload?.combatRequest?.enemies),
    title: payload?.combatRequest?.title || plannedTurn?.beat || (signal.challengeType === "boss" ? "Boss Gate" : "GM Combat"),
    objective: payload?.combatRequest?.objective || plannedTurn?.enemyBrief || "Break the threat in the current scene."
  }) : null;
  const ritual = encounter?.ritual || null;
  if (ritual) {
    payload.ritualRequest = {
      title: ritual.title,
      description: ritual.description,
      sphere: ritual.sphere,
      size: ritual.size,
      proofPrompt: ritual.description
    };
  }
  if (encounter) {
    encounter.challengeSignal = { ...encounter.challengeSignal, ...signal };
    campaign.activeEncounter = encounter;
    campaign.mechanicalResults = {
      ...campaign.mechanicalResults,
      pendingEncounter: encounter.title,
      target: encounter.target,
      primaryStat: encounter.challengeSignal.primaryStat,
      ritualRequired: ritual?.title
    };
  } else {
    campaign.activeEncounter = null;
  }
  campaign.currentTurnDraft = {
    id: uid("draft"),
    turnNumber: campaign.turnNumber,
    visibleTurnText: validation.visibleTurnText,
    gmPayload: payload,
    challengeSignal: payload?.challengeSignal || null,
    actionOptions: payload?.actionOptions || null,
    ritualRequest: payload?.ritualRequest || null,
    stateDeltaProposal: payload?.stateDeltaProposal || null,
    rawText,
    createdAt: now
  };
  campaign.activeOutGameMission = ritual ? {
    id: uid("mission"),
    status: "required",
    completed: false,
    proofNote: "",
    ritual,
    createdAt: now
  } : null;
  campaign.updatedAt = now;
  return campaign.currentTurnDraft;
}

function normalizeEnemies(enemies) {
  if (!Array.isArray(enemies) || !enemies.length) return null;
  return enemies.slice(0, 6).map((enemy) => ({
    id: uid("enemy"),
    name: enemy.name || "Vanaheim Threat",
    hp: Number(enemy.hp || enemy.maxHp || 12),
    maxHp: Number(enemy.maxHp || enemy.hp || 12),
    condition: enemy.condition || enemy.statHint || "ready"
  }));
}

export function validateGmOutput(raw) {
  const text = String(raw || "").trim();
  const result = {
    ok: false,
    mode: "text",
    payload: null,
    visibleTurnText: text,
    issues: []
  };
  if (!text) {
    result.issues.push("No GM output provided.");
    return result;
  }
  try {
    const parsed = JSON.parse(text);
    result.mode = "json";
    result.payload = repairGmPayload(parsed, parsed.visibleTurnText || "");
    result.visibleTurnText = parsed.visibleTurnText || "";
    if (!parsed.visibleTurnText) result.issues.push("JSON is missing visibleTurnText.");
    if (!parsed.challengeSignal) result.issues.push("JSON is missing challengeSignal.");
    if (["combat", "boss"].includes(result.payload?.challengeSignal?.challengeType) && !result.payload?.ritualRequest?.title) result.issues.push("Could not derive ritualRequest from ritualRequest or OUT-GAME.");
    if (!parsed.memoryDelta) result.issues.push("JSON is missing memoryDelta.");
  } catch {
    if (text.length < 80) result.issues.push("GM text is too short to play.");
  }
  result.ok = result.issues.length === 0;
  return result;
}
