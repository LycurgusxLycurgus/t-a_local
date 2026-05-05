import test from "node:test";
import assert from "node:assert/strict";

import { createCampaign, validateGmOutput } from "../src/js/campaign.js";
import { buildPromptBundle, getBridgecruxRegistry } from "../src/js/prompts.js";
import { createInitialState } from "../src/js/state.js";
import { selectRitual, targetForDifficulty } from "../src/js/rules.js";

test("difficulty targets stay inside configured bands", () => {
  assert.equal(targetForDifficulty("normal", 1), 12);
  assert.equal(targetForDifficulty("boss", 20), 17);
});

test("campaign creation preserves mandatory rituals", () => {
  const state = createInitialState();
  const mandatoryRitualIds = state.ritualPools.slice(0, 2).map((ritual) => ritual.id);
  const campaign = createCampaign(state, {
    title: "Prueba",
    maxTurns: 20,
    juaneteClass: "Paladin",
    ironmoleClass: "Picaro",
    mandatoryRitualIds
  });
  assert.deepEqual(campaign.mandatoryRitualIds, mandatoryRitualIds);
});

test("GM JSON validates and receives fallback action options", () => {
  const raw = JSON.stringify({
    visibleTurnText: "La escena abre con una amenaza clara y una decision inmediata para ambos heroes.",
    challengeSignal: {
      challengeType: "explore",
      difficultyBand: "normal",
      primaryStat: "Inteligencia",
      stakes: "medium",
      requiresOutGame: false,
      ritualSize: "none"
    },
    actionOptions: { juanete: [], ironmole: [] },
    stateDeltaProposal: {},
    ritualRequest: { title: "", description: "", sphere: "", size: "none", proofPrompt: "" },
    lootProposal: {},
    memoryDelta: {},
    validationNotes: []
  });
  const validation = validateGmOutput(raw);
  assert.equal(validation.ok, true);
  assert.ok(validation.payload.actionOptions.juanete.length > 0);
  assert.ok(validation.payload.actionOptions.ironmole.length > 0);
});

test("Bridgecrux registry prefers editable memory over defaults", () => {
  const state = createInitialState();
  state.memories["universal_system.md"] = "# Custom Universal";
  const registry = getBridgecruxRegistry(state);
  assert.equal(registry["universal_system.md"], "# Custom Universal");
  const prompt = buildPromptBundle(state, null, "");
  assert.match(prompt, /# Custom Universal/);
});

test("ritual selection can use reward bias", () => {
  const state = createInitialState();
  const ritual = selectRitual(state, {
    size: "micro",
    rewardIntent: "clarity strategy idea",
    tags: ["strategy"]
  });
  assert.equal(ritual.size, "micro");
});
