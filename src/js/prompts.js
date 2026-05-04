export const bridgecruxFiles = {
  "universal_system.md": `# Universal System

Totumas & Aventuras is a fast local-first narrative-tactical campaign engine for Juanete and Ironmole.

The code owns state, turn count, stats, DCs, rolls, score challenges, rituals, inventory, campaign memory, and validation. The LLM owns narration, consequences, enemy flavor, Vanaheim companion reactions, subclass flavor, and soft proposals.

Every GM turn must keep momentum. A turn must change situation, mechanics, tactical pressure, reward, cost, or discovery.`,

  "assistants.md": `# Assistants Router

Use a heavy model for campaign architecture, act maps, full campaign repair, and final recaps.
Use a medium model for ordinary GM turns, combat narration, ritual integration, and loot flavor.
Use a small model for validation, extraction, compact summaries, and missing-section repair.`,

  "output_contracts.md": `# Output Contracts

The app expects JSON with:

\`\`\`json
{
  "visibleTurnText": "...",
  "actionOptions": {
    "juanete": [{"id": "j1", "label": "...", "stat": "Carisma", "intent": "..."}],
    "ironmole": [{"id": "i1", "label": "...", "stat": "Inteligencia", "intent": "..."}]
  },
  "challengeSignal": {
    "challengeType": "combat|explore|social|ritual|boss",
    "difficultyBand": "easy|normal|hard|boss|mythic",
    "primaryStat": "Fuerza|Inteligencia|Carisma|Magnetismo",
    "stakes": "low|medium|high|campaign-critical",
    "requiresOutGame": true,
    "ritualSize": "micro|macro|none"
  },
  "stateDeltaProposal": {},
  "ritualRequest": {"title": "...", "description": "...", "sphere": "...", "size": "micro|macro|none", "proofPrompt": "..."},
  "lootProposal": {},
  "memoryDelta": {},
  "validationNotes": []
}
\`\`\``
};

export const GM_TURN_SCHEMA = {
  type: "object",
  properties: {
    visibleTurnText: {
      type: "string",
      description: "The complete player-visible GM turn text with required sections."
    },
    challengeSignal: {
      type: "object",
      properties: {
        challengeType: { type: "string", enum: ["combat", "explore", "social", "ritual", "boss"] },
        difficultyBand: { type: "string", enum: ["easy", "normal", "hard", "boss", "mythic"] },
        primaryStat: { type: "string", enum: ["Fuerza", "Inteligencia", "Carisma", "Magnetismo"] },
        stakes: { type: "string", enum: ["low", "medium", "high", "campaign-critical"] },
        requiresOutGame: { type: "boolean" },
        ritualSize: { type: "string", enum: ["micro", "macro", "none"] }
      },
      required: ["challengeType", "difficultyBand", "primaryStat", "stakes", "requiresOutGame", "ritualSize"]
    },
    actionOptions: {
      type: "object",
      properties: {
        juanete: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              stat: { type: "string", enum: ["Fuerza", "Inteligencia", "Carisma", "Magnetismo"] },
              intent: { type: "string" }
            },
            required: ["id", "label", "stat", "intent"]
          }
        },
        ironmole: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              stat: { type: "string", enum: ["Fuerza", "Inteligencia", "Carisma", "Magnetismo"] },
              intent: { type: "string" }
            },
            required: ["id", "label", "stat", "intent"]
          }
        }
      },
      required: ["juanete", "ironmole"]
    },
    stateDeltaProposal: {
      type: "object",
      additionalProperties: true
    },
    combatRequest: {
      type: "object",
      properties: {
        title: { type: "string" },
        objective: { type: "string" },
        enemyHint: { type: "string" }
      },
      required: ["title", "objective", "enemyHint"]
    },
    ritualRequest: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        sphere: { type: "string" },
        size: { type: "string", enum: ["micro", "macro", "none"] },
        proofPrompt: { type: "string" }
      },
      required: ["title", "description", "sphere", "size", "proofPrompt"]
    },
    lootProposal: {
      type: "object",
      additionalProperties: true
    },
    memoryDelta: {
      type: "object",
      additionalProperties: true
    },
    validationNotes: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["visibleTurnText", "actionOptions", "challengeSignal", "stateDeltaProposal", "ritualRequest", "lootProposal", "memoryDelta", "validationNotes"]
};

export function buildSystemInstruction() {
  return [
    bridgecruxFiles["universal_system.md"],
    "",
    bridgecruxFiles["assistants.md"],
    "",
    "Return valid JSON matching the provided schema. The visibleTurnText must include RESOLUCION, ESCENA, ESTADO TACTICO, OUT-GAME, ACCIONES POSIBLES, and MECANICA. Keep prose compact and tactical. OUT-GAME must be diegetic: a seal, key, offering, training, resonance, pact, wound, proof, or fuel inside the fiction. Always provide actionOptions with 2-3 concrete choices for Juanete and 2-3 for Ironmole; these become game buttons. Always provide ritualRequest when challengeSignal.requiresOutGame is true. If challengeSignal.challengeType is combat or boss, include a combatRequest object with title, objective, and enemyHint; the code will create the encounter mechanics. Do not write administrative setup instructions. Do not decide exact DCs. Do not complete out-game rituals for the players."
  ].join("\n");
}

export function compactStateForPrompt(state, campaign, playerActions = "") {
  const turns = campaign?.turns || [];
  const recentTurns = turns.slice(-3).map((turn) => ({
    turnNumber: turn.turnNumber,
    summary: turn.visibleTurnText.slice(0, 700),
    mechanicalResults: turn.mechanicalResults
  }));
  return {
    campaign: campaign ? {
      title: campaign.title,
      turnNumber: campaign.turnNumber,
      maxTurns: campaign.maxTurns,
      phase: campaign.phase,
      mode: campaign.mode,
      intensity: campaign.intensity,
      combatWeight: campaign.combatWeight,
      seed: campaign.seed,
      actMap: campaign.actMap,
      currentTurnDraft: campaign.currentTurnDraft ? {
        turnNumber: campaign.currentTurnDraft.turnNumber,
        visibleTurnText: campaign.currentTurnDraft.visibleTurnText,
        challengeSignal: campaign.currentTurnDraft.challengeSignal
      } : null
    } : null,
    pcs: {
      juanete: state.characters.juanete,
      ironmole: state.characters.ironmole
    },
    vanaheim: state.characters.vanaheim,
    activeEncounter: campaign?.activeEncounter || null,
    activeOutGameMission: campaign?.activeOutGameMission || null,
    recentTurnsSummary: recentTurns,
    lastPlayerActions: playerActions,
    mechanicalResults: campaign?.mechanicalResults || {},
    requiredOutput: campaign?.turnNumber === 1 && !campaign?.currentTurnDraft && !turns.length ? "opening_gm_turn" : "gm_turn"
  };
}

export function buildPromptBundle(state, campaign, playerActions = "") {
  const compact = compactStateForPrompt(state, campaign, playerActions);
  return [
    "SYSTEM FILE: universal_system.md",
    bridgecruxFiles["universal_system.md"],
    "",
    "ROUTER FILE: assistants.md",
    bridgecruxFiles["assistants.md"],
    "",
    "OUTPUT CONTRACT: output_contracts.md",
    bridgecruxFiles["output_contracts.md"],
    "",
    "COMPACT STATE JSON",
    JSON.stringify(compact, null, 2),
    "",
    "GM STYLE CONTRACT",
    "Use compact Spanish prose. Keep action above ornament. Include the sections RESOLUCION, ESCENA, ESTADO TACTICO, OUT-GAME, ACCIONES POSIBLES, and MECANICA inside visibleTurnText. For ACCIONES POSIBLES and actionOptions, write distinct actionable options for Juanete and Ironmole; actionOptions are primary UI buttons, not suggestions hidden in prose. OUT-GAME must be diegetic: a seal, key, offering, training, resonance, pact, wound, proof, or fuel inside the fiction. If challengeSignal.requiresOutGame is true, ritualRequest must describe the ritual proof clearly enough to render as a checkbox gate. If this turn is combat or boss, set challengeSignal.challengeType accordingly and include combatRequest; do not ask the player to manually open combat. Do not write administrative setup instructions. Do not decide exact DCs. Do not complete out-game rituals for the players. If this is opening_gm_turn, start the campaign directly with the first playable scene; do not ask setup questions. If recentTurnsSummary contains turns, continue from those events and the lastPlayerActions; do not restart the campaign or reintroduce the opening situation."
  ].join("\n");
}
