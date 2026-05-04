export const bridgecruxFiles = {
  "universal_system.md": `# Universal System

Totumas & Aventuras is a fast local-first narrative-tactical campaign engine for Juanete and Ironmole.

The code owns state, turn count, stats, DCs, rolls, score challenges, rituals, inventory, campaign memory, and validation. The LLM owns narration, consequences, enemy flavor, Vanaheim companion reactions, subclass flavor, and soft proposals.

The app solves a specific problem: turning Epicurogotchi, Vanaheim, out-game rituals, tactical fights, and shared relationship mythology into a playable campaign instead of a loose LLM chat. The interface should feel like a game table with a GM engine behind it, not a model playground.

Epicurogotchi is the shared living pet/context vessel. Piccolo stores discoveries, growth, ritual seeds, and campaign resonance. Turn 0 always begins by checking Piccolo and the living sheet, so the campaign starts from the real state of the shared world.

Vanaheim is the mythic pressure field around Juanete and Ironmole. Its companions are sphere anchors: Din for emotional resonance, Segismundo for body/material pleasure, Hagen for intellect/strategy, and Elektra for aesthetic/creative force. Campaigns should make these pressures concrete through scenes, enemies, gifts, choices, costs, and rituals.

Rituals are not generic side quests. They are diegetic out-game proofs that connect play to real acts, attention, care, training, taste, creation, memory, or experiment. Combat and boss turns can require rituals; ordinary explore/social turns usually should not.

Every campaign needs a meaningful arc: a premise, Vanaheim pressure, recurring antagonist thread, tactical escalation, discoveries for Piccolo, and turns that change the state of the relationship-world. Every GM turn must keep momentum. A turn must change situation, mechanics, tactical pressure, reward, cost, or discovery.`,

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
  "combatRequest": {"title": "...", "objective": "...", "enemyHint": "...", "enemies": [{"name": "...", "hp": 12, "maxHp": 12, "statHint": "Fuerza", "condition": "ready"}]},
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
        enemyHint: { type: "string" },
        enemies: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              hp: { type: "number" },
              maxHp: { type: "number" },
              statHint: { type: "string" },
              condition: { type: "string" }
            },
            required: ["name", "hp", "maxHp", "statHint", "condition"]
          }
        }
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

export const SEED_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "A compact Spanish campaign title."
    },
    seed: {
      type: "string",
      description: "A compact Spanish campaign seed, 2-4 sentences, ready to paste into setup."
    }
  },
  required: ["title", "seed"]
};

export const CAMPAIGN_MAP_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    premise: { type: "string" },
    campaignArc: { type: "string" },
    turnPlan: {
      type: "array",
      items: {
        type: "object",
        properties: {
          turn: { type: "number" },
          beat: { type: "string" },
          challengeType: { type: "string", enum: ["combat", "explore", "social", "ritual", "boss"] },
          difficultyBand: { type: "string", enum: ["easy", "normal", "hard", "boss", "mythic"] },
          primaryStat: { type: "string", enum: ["Fuerza", "Inteligencia", "Carisma", "Magnetismo"] },
          ritualId: { type: "string" },
          ritualTitle: { type: "string" },
          enemyBrief: { type: "string" },
          rewardHint: { type: "string" }
        },
        required: ["turn", "beat", "challengeType", "difficultyBand", "primaryStat", "ritualId", "ritualTitle", "enemyBrief", "rewardHint"]
      }
    },
    antagonistThread: { type: "string" },
    vanaheimPressure: {
      type: "array",
      items: { type: "string" }
    },
    ritualNotes: { type: "string" }
  },
  required: ["title", "premise", "campaignArc", "turnPlan", "antagonistThread", "vanaheimPressure", "ritualNotes"]
};

export function buildSystemInstruction() {
  return [
    bridgecruxFiles["universal_system.md"],
    "",
    "Return valid JSON matching the provided schema. visibleTurnText is player-facing GM narration, not a debug report: write compact Spanish prose that naturally includes resolution, scene, tactical situation, and what is at stake, but do not need section headings. Always provide actionOptions with 2-3 concrete choices for Juanete and 2-3 for Ironmole; these become game buttons. Only combat or boss turns require ritualRequest; explore/social turns should set requiresOutGame false and ritualSize none. If challengeSignal.challengeType is combat or boss, include combatRequest with title, objective, enemyHint, and enemies with HP/stat hints. If the compact state contains a campaignMap entry for this turn, follow its beat, challenge type, enemy brief, and ritual title exactly. Do not invent ritual names when a mapped ritual is present. Do not write administrative setup instructions. Do not decide exact DCs. Do not complete out-game rituals for the players."
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
      campaignMap: campaign.campaignMap || null,
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
    plannedTurn: campaign?.campaignMap?.turnPlan?.find((item) => Number(item.turn) === Number(campaign.turnNumber)) || null,
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
    "OUTPUT CONTRACT: output_contracts.md",
    bridgecruxFiles["output_contracts.md"],
    "",
    "COMPACT STATE JSON",
    JSON.stringify(compact, null, 2),
    "",
    "GM STYLE CONTRACT",
    "Use compact Spanish prose. Keep action above ornament. visibleTurnText should read like a GM talking to players, not like an API checklist. Put tactical state and stakes inside the narration. actionOptions are the primary UI buttons, so provide them clearly for both players. Follow plannedTurn from the campaign map when present. Explore/social turns ask for rolls but do not require out-game rituals. Combat/boss turns require the mapped library ritual and combatRequest with enemy HP hints; do not ask the player to manually open combat. Do not decide exact DCs. Do not complete out-game rituals for the players. If this is opening_gm_turn, start the campaign directly with the first playable scene. If recentTurnsSummary contains turns, continue from those events and the lastPlayerActions; do not restart the campaign."
  ].join("\n");
}
