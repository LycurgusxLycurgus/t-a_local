import { createInitialState, getActiveCampaign, getActiveEpicurogotchi, SPHERES, CLASS_NAMES } from "./state.js";
import { loadState, saveState, resetStoredState } from "./storage.js";
import { createCampaign, completeActiveRitual, registerScore, commitTurn, validateGmOutput, setCurrentTurnDraft } from "./campaign.js";
import { buildPromptBundle, buildSystemInstruction, getBridgecruxRegistry } from "./prompts.js";
import { addRitual, deleteRitual, ritualStats } from "./rituals.js";
import { addDiscovery, levelUp, setPetImageFromFile } from "./epicurogotchi.js";
import { exportBundle, importBundle } from "./importExport.js";
import { CLASS_TABLE, modifierFor, rollD20, scoreFromTimingPercent, targetForDifficulty } from "./rules.js";
import { callGemini, defaultLlmEndpoint, GEMINI_MODEL_TIERS, GEMINI_MODES, isLocalBrowserOrigin, normalizeLlmEndpoint } from "./llmClient.js";
import { routeForTier } from "./llmConfig.js";
import { CAMPAIGN_MAP_SCHEMA, GM_TURN_SCHEMA, SEED_SCHEMA } from "./prompts.js";

let state = loadState();
let ui = {
  view: "dashboard",
  toast: "",
  currentFile: "memory.md",
  promptOutput: "",
  gmOutput: "",
  playerActions: "",
  validation: null,
  llmBusy: false,
  seedBusy: false,
  mapBusy: false,
  llmError: "",
  advancedOpen: false,
  setupTitle: "",
  setupSeed: "",
  setupForm: {},
  setupClasses: {},
  selectedActions: {},
  customActions: {},
  ritualComplete: false,
  ritualProof: "",
  rolls: {},
  bonusScore: null,
  timing: {
    active: false,
    startedAt: 0,
    raf: 0,
    marker: 0,
    direction: 1
  }
};

const EPICUROGOTCHI_SHEET_URL = "https://docs.google.com/spreadsheets/d/1qLe-7RIP0ntCGtswvpo5IU9zRyQGC0-C-BD1UkHY93s/edit?gid=1189524253#gid=1189524253";

const app = document.querySelector("#app");

function persist(message = "Saved") {
  saveState(state);
  showToast(message);
}

function showToast(message) {
  ui.toast = message;
  render();
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    ui.toast = "";
    render();
  }, 2600);
}

function icon(name) {
  return `<i data-lucide="${name}" aria-hidden="true"></i>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function options(items, selected) {
  return items.map((item) => `<option value="${escapeHtml(item)}" ${item === selected ? "selected" : ""}>${escapeHtml(item)}</option>`).join("");
}

function setupValue(name, fallback = "") {
  return ui.setupForm[name] ?? fallback;
}

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function resetTurnInputs() {
  ui.selectedActions = {};
  ui.customActions = {};
  ui.ritualComplete = false;
  ui.ritualProof = "";
  ui.rolls = {};
  ui.bonusScore = null;
  ui.timing.active = false;
  if (ui.timing.raf) window.cancelAnimationFrame(ui.timing.raf);
}

function render() {
  const campaign = getActiveCampaign(state);
  app.innerHTML = `
    <div class="layout app-table">
      ${renderGlobalNav(campaign)}
      <main class="main app-view active" id="main-content">
        ${renderScreen(campaign)}
      </main>
    </div>
    ${ui.toast ? `<div class="toast">${escapeHtml(ui.toast)}</div>` : ""}
  `;
  bindEvents();
  applyVisualEnhancements();
  if (window.lucide) window.lucide.createIcons();
  centerSelectedForgeClasses();
}

function applyVisualEnhancements() {
  document.documentElement.classList.remove("no-js");
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;
  document.body.classList.toggle("reduced-motion", reducedMotion);
}

function centerSelectedForgeClasses() {
  document.querySelectorAll(".forge-class-rail input:checked").forEach((input) => {
    const token = input.closest(".forge-class-token");
    const rail = input.closest(".forge-class-rail");
    if (!token || !rail) return;
    const targetLeft = token.offsetLeft - (rail.clientWidth - token.clientWidth) / 2;
    rail.scrollLeft = Math.max(0, targetLeft);
  });
  window.scrollTo({ left: 0, top: window.scrollY });
}

function initGlobalUx() {
  document.documentElement.classList.remove("no-js");
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.addEventListener("change", (event) => {
    document.body.classList.toggle("reduced-motion", event.matches);
  });
  document.addEventListener("keydown", (event) => {
    if (!event.altKey || event.key < "1" || event.key > "7") return;
    const navButtons = [...document.querySelectorAll(".nav-link")];
    const target = navButtons[Number(event.key) - 1];
    if (!target) return;
    event.preventDefault();
    target.click();
    target.focus();
  });
}

function renderGlobalNav(campaign) {
  const items = [
    ["dashboard", "layout-dashboard", "The Hearth"],
    ["setup", "hammer", "Forge"],
    ["play", "swords", "Crucible"],
    ["rituals", "book-open", "Tome"],
    ["epicurogotchi", "egg", "Artifact"],
    ["memory", "folder-open", "Memory"],
    ["bridgecrux", "route", "Bridgecrux"]
  ];
  return `
    <nav class="global-nav" aria-label="Primary">
      <div class="nav-brand">
        <span>Totumas & Aventuras</span>
        <small>${campaign ? `${escapeHtml(campaign.title)} / Turn ${campaign.turnNumber}/${campaign.maxTurns}` : "Open the table"}</small>
      </div>
      <div class="nav-links">
        ${items.map(([view, iconName, label]) => `
          <button class="nav-link ${view === "bridgecrux" ? "dev-link" : ""} ${ui.view === view ? "active" : ""}" data-view="${view}">
            ${icon(iconName)} <span>${label}</span>
          </button>
        `).join("")}
      </div>
      <div class="nav-actions">
        <button class="btn secondary" data-action="export-state" style="padding: 0 12px; min-height: 32px; font-size: 0.7rem;">${icon("download")} Export</button>
        <label class="btn secondary" style="padding: 0 12px; min-height: 32px; font-size: 0.7rem; cursor: pointer;">
          ${icon("upload")} Import
          <input data-action="import-state" type="file" accept="application/json" hidden>
        </label>
        <button class="btn secondary" data-action="save-state" style="padding: 0 12px; min-height: 32px; font-size: 0.7rem;">${icon("save")} Save</button>
      </div>
    </nav>
  `;
}

function renderScreen(campaign) {
  const screens = {
    dashboard: () => renderDashboard(campaign),
    setup: () => renderSetup(campaign),
    play: () => renderPlay(campaign),
    rituals: () => renderRituals(),
    epicurogotchi: () => renderEpicurogotchi(),
    memory: () => renderMemory(),
    bridgecrux: () => renderBridgecrux()
  };
  return (screens[ui.view] || screens.dashboard)();
}

/* ==========================================================================
   VIEWS
   ========================================================================== */

function renderDashboard(campaign) {
  const pet = getActiveEpicurogotchi(state);
  const progress = campaign ? Math.round((campaign.turnNumber / campaign.maxTurns) * 100) : 0;
  return `
    <section class="screen">
      <div class="plate active-plate hero-panel">
        <div class="hero-copy">
          <div>
            <span class="label">Shared hearth</span>
            <h2 class="screen-title" style="border: none;">${campaign ? escapeHtml(campaign.title) : "Open the First Totuma"}</h2>
            <p class="lore-text" style="font-size: 1.2rem; margin-top: var(--space-2);">${campaign ? "A fast campaign engine for tactical turns, diegetic out-game missions, and Epicurogotchi growth." : "Create a campaign, choose classes, and let the code prepare a compact GM context."}</p>
          </div>
          <div class="stack">
            <div class="resource-track" aria-label="Campaign progress"><div class="resource-fill hp-juanete" style="width:${progress}%"></div></div>
            <div class="metric-strip" style="margin-top: var(--space-2);">
              ${metric("Turn", campaign ? `${campaign.turnNumber}/${campaign.maxTurns}` : "0/20")}
              ${metric("Phase", campaign ? campaign.phase : "setup")}
              ${metric("Piccolo", `Lv ${pet.level}`)}
              ${metric("Rituals", state.ritualPools.length)}
            </div>
          </div>
        </div>
        <div class="hero-art">
          <img src="${escapeHtml(pet.image)}" alt="Piccolo Epicurogotchi">
        </div>
      </div>
      
      <div class="grid two" style="margin-top: var(--space-4);">
        ${renderActiveMission(campaign)}
        ${renderCharacters()}
      </div>
      
      <div class="plate" style="margin-top: var(--space-4);">
        <div class="split">
          <div>
            <span class="label">Vanaheim companions</span>
            <h3 class="panel-title">Sphere pressure map</h3>
          </div>
          <button class="btn" data-view="play">${icon("swords")} Open Crucible</button>
        </div>
        ${renderCompanions()}
      </div>
    </section>
  `;
}

function metric(label, value) {
  return `<div class="stat-box"><span class="label">${escapeHtml(label)}</span><strong class="stat-val">${escapeHtml(value)}</strong></div>`;
}

function classStatPills(profile) {
  return Object.entries(profile)
    .filter(([key]) => ["Fuerza", "Inteligencia", "Carisma", "Magnetismo"].includes(key))
    .map(([key, value]) => `<span class="pill">${escapeHtml(key.substring(0, 3).toUpperCase())} ${escapeHtml(value)}</span>`)
    .join("");
}

function classRail(playerKey, selectedClass) {
  const railIcons = ["flame", "shield", "wand-sparkles", "swords", "sparkles", "crosshair", "hammer", "skull"];
  return `
    <div class="forge-class-rail" role="radiogroup" aria-label="${escapeHtml(playerKey)} class">
      ${CLASS_NAMES.map((name, index) => {
        const profile = CLASS_TABLE[name];
        const checked = name === selectedClass;
        return `
          <label class="forge-class-token ${checked ? "is-selected" : ""}">
            <input type="radio" name="${escapeHtml(playerKey)}Class" value="${escapeHtml(name)}" ${checked ? "checked" : ""}>
            ${icon(railIcons[index % railIcons.length])}
            <span>${escapeHtml(name)}</span>
            <small>${escapeHtml(profile.resource)}</small>
          </label>
        `;
      }).join("")}
    </div>
  `;
}

function renderHeroForgeSlot(playerName, playerKey, selectedClass) {
  const profile = CLASS_TABLE[selectedClass] || CLASS_TABLE[CLASS_NAMES[0]];
  const hpPreview = Math.max(12, Math.min(18, Math.round((profile.Fuerza + profile.Magnetismo) / 2)));
  const crestIcon = playerKey === "juanete" ? "music-2" : "anvil";
  return `
    <section class="forge-hero-slot ${playerKey}">
      <div class="forge-hero-main">
        <div class="forge-crest">${icon(crestIcon)}</div>
        <div class="forge-hero-copy">
          <span class="label">Hero vessel</span>
          <h3>${escapeHtml(playerName)}</h3>
          <p class="meta">Class</p>
          <strong>${escapeHtml(selectedClass)}</strong>
          <p class="lore-text">${escapeHtml(profile.resource)} - ${escapeHtml(profile.tendency)}</p>
          <div class="pill-row">${classStatPills(profile)}</div>
        </div>
        <div class="forge-hp-preview">
          <span class="label">HP Preview</span>
          <strong>${hpPreview} / 15</strong>
          <div class="resource-track"><div class="resource-fill" style="width:${Math.min(100, Math.round((hpPreview / 15) * 100))}%"></div></div>
          <div class="forge-stat-grid">
            <span><b>FUE</b>${escapeHtml(profile.Fuerza)}</span>
            <span><b>INT</b>${escapeHtml(profile.Inteligencia)}</span>
            <span><b>CAR</b>${escapeHtml(profile.Carisma)}</span>
            <span><b>MAG</b>${escapeHtml(profile.Magnetismo)}</span>
          </div>
        </div>
      </div>
      ${classRail(playerKey, selectedClass)}
    </section>
  `;
}

function renderMandatoryRitualDrawer(campaign) {
  const selected = campaign?.mandatoryRitualIds || [];
  return `
    <section class="forge-ritual-drawer">
      <div class="split">
        <div>
          <span class="label">Mandatory campaign rituals</span>
          <p class="meta">Pick the rituals that must appear somewhere in the campaign map.</p>
        </div>
        <span class="pill hot" data-ritual-count>${selected.length} selected</span>
      </div>
      <div class="forge-ritual-grid">
        ${state.ritualPools.map((ritual) => {
          const checked = selected.includes(ritual.id);
          return `
            <label class="forge-ritual-chip ${checked ? "is-selected" : ""}">
              <input type="checkbox" name="mandatoryRitualIds" value="${escapeHtml(ritual.id)}" ${checked ? "checked" : ""}>
              ${icon(ritual.size === "macro" ? "orbit" : "badge")}
              <span>${escapeHtml(ritual.title)} <small>${escapeHtml(ritual.size)} / ${escapeHtml(ritual.sphere)}</small></span>
            </label>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderActiveMission(campaign) {
  const mission = campaign?.activeOutGameMission;
  return `
    <div class="plate">
      <span class="label">Out-game mission</span>
      <h3 class="panel-title">${mission ? escapeHtml(mission.ritual.title) : "None active"}</h3>
      ${mission ? `
        <p class="lore-text" style="margin-top: var(--space-2);">${escapeHtml(mission.ritual.description)}</p>
        <div class="pill-row">
          <span class="pill ${mission.completed ? "hot" : "danger"}">${mission.completed ? "completed" : mission.status}</span>
          <span class="pill">${mission.ritual.size}</span>
          <span class="pill cool">${mission.ritual.sphere}</span>
        </div>
      ` : `<p class="lore-text" style="margin-top: var(--space-2);">Combat encounters will always require a micro or macro ritual before advancement.</p>`}
    </div>
  `;
}

function renderCharacters() {
  const pcs = [state.characters.juanete, state.characters.ironmole].filter(Boolean);
  return `
    <div class="plate">
      <span class="label">Player characters</span>
      <h3 class="panel-title">Juanete / Ironmole</h3>
      <div class="card-list" style="margin-top: var(--space-4);">
        ${pcs.length ? pcs.map((pc, idx) => `
          <div class="hero-card ${idx === 1 ? 'ironmole' : ''}">
            <div class="split">
              <div>
                <h4 class="item-title">${escapeHtml(pc.name)} - ${escapeHtml(pc.className)}</h4>
                <p class="meta">${escapeHtml(pc.resource)} / ${escapeHtml(pc.tendency)}</p>
              </div>
              <span class="pill hot">HP ${pc.hp}/${pc.maxHp}</span>
            </div>
            <div class="stat-grid" style="margin-top: var(--space-3); grid-template-columns: repeat(4, 1fr);">
              ${Object.entries(pc.stats).map(([stat, value]) => `
                <div class="stat-box" style="padding: var(--space-1);">
                  <span class="label">${escapeHtml(stat).substring(0,3)}</span>
                  <strong class="stat-val" style="font-size: 1.1rem; margin-top: 2px;">${value}</strong>
                </div>
              `).join("")}
            </div>
          </div>
        `).join("") : `<div class="empty-state">No classes selected yet.</div>`}
      </div>
    </div>
  `;
}

function renderCompanions() {
  const companions = Object.values(state.characters.vanaheim);
  return `
    <div class="companion-grid" style="margin-top: var(--space-4);">
      ${companions.map((companion) => {
        const sphere = SPHERES.find((item) => item.id === companion.sphere);
        return `
          <div class="item-card">
            <h4 class="item-title" style="color: var(--color-gold-400);">${icon(sphere?.icon || "sparkle")} ${escapeHtml(companion.name)}</h4>
            <p class="meta" style="margin-top: 4px;">${escapeHtml(companion.sphere)} - Lv ${companion.level}</p>
            <p class="lore-text" style="font-size: 0.85rem; margin-top: var(--space-2);">${escapeHtml(companion.notes)}</p>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderSetup(campaign) {
  const selectedJuanete = ui.setupClasses.juanete || setupValue("juaneteClass", campaign?.selectedClasses?.juanete || "Bardo");
  const selectedIronmole = ui.setupClasses.ironmole || setupValue("ironmoleClass", campaign?.selectedClasses?.ironmole || "Artificiero");
  return `
    <section class="screen forge-screen">
      <form class="forge-console" data-form="campaign-setup">
        <div class="forge-crown" aria-hidden="true">${icon("hammer")}</div>
        <header class="forge-heading">
          <span class="label">Campaign setup</span>
          <h2 class="screen-title">Forge a Run</h2>
        </header>

        <section class="forge-control-band" aria-label="Campaign controls">
          <div class="field forge-title-field">
            <label for="title">Campaign title</label>
            <input id="title" name="title" value="${escapeHtml(ui.setupTitle || campaign?.title || "The First Totuma")}" maxlength="80">
          </div>
          <div class="field">
            <label for="mode">Campaign type</label>
            <select id="mode" name="mode">${options(["canon", "rogue-crossover", "free-weird-run"], setupValue("mode", campaign?.mode || "canon"))}</select>
          </div>
          <div class="field">
            <label for="maxTurns">Target turns</label>
            <select id="maxTurns" name="maxTurns">${options(["20", "24"], setupValue("maxTurns", String(campaign?.maxTurns || 20)))}</select>
          </div>
          <div class="field">
            <label for="intensity">Combat intensity</label>
            <select id="intensity" name="intensity">${options(["normal", "chaotic", "boss-heavy"], setupValue("intensity", campaign?.intensity || "normal"))}</select>
          </div>
          <div class="field">
            <label for="combatWeight">Combat weight %</label>
            <input id="combatWeight" name="combatWeight" type="number" min="50" max="95" value="${escapeHtml(setupValue("combatWeight", campaign?.combatWeight || 80))}">
          </div>
        </section>

        <div class="forge-hero-bays">
          ${renderHeroForgeSlot("Juanete", "juanete", selectedJuanete)}
          ${renderHeroForgeSlot("Ironmole", "ironmole", selectedIronmole)}
        </div>

        ${renderMandatoryRitualDrawer(campaign)}

        <footer class="forge-footer">
          <div class="field forge-seed-field">
            <label for="seed">Campaign seed</label>
            <textarea id="seed" name="seed" placeholder="Imagen, reliquia, tono, problema tactico o deseo a probar.">${escapeHtml(ui.setupSeed || campaign?.seed || "")}</textarea>
          </div>
          <div class="forge-footer-actions">
            <button class="btn secondary" type="button" data-action="random-seed" ${ui.seedBusy ? "disabled" : ""}>${icon("shuffle")} ${ui.seedBusy ? "Generando..." : "Generate local seed"}</button>
            <button class="btn btn-large forge-ignite" type="submit" ${ui.mapBusy ? "disabled" : ""}>${icon("hammer")} ${ui.mapBusy ? "Forging map..." : "Ignite Campaign Map"}</button>
          </div>
        </footer>
      </form>
    </section>
  `;
}

function renderPlay(campaign) {
  if (!campaign) {
    return `
      <section class="screen">
        <div class="empty-state" style="padding: var(--space-6);">
          <h2 class="screen-title" style="border:none;">No active campaign</h2>
          <p class="lore-text">Create a campaign before opening play.</p>
          <button class="btn" style="margin-top: var(--space-4);" data-view="setup">${icon("scroll")} Campaign Setup</button>
        </div>
      </section>
    `;
  }
  if (campaign.turnNumber === 0) {
    return renderEpicurogotchiPrelude(campaign);
  }
  const currentDraft = campaign.currentTurnDraft || null;
  if (campaign.activeEncounter && currentDraft) {
    return renderCombatCockpit(campaign, currentDraft);
  }
  
  // Normal Play (Exploration / Non-Combat)
  return `
    <section class="screen">
      <div class="screen-header">
        <div>
          <span class="label">Campaign play</span>
          <h2 class="screen-title" style="border:none;">${escapeHtml(campaign.title)}</h2>
        </div>
      </div>
      ${renderTopHud(campaign)}
      <div class="grid two game-table">
        <div class="stack game-main">
          ${renderCurrentScene(campaign, currentDraft)}
          ${renderPlayerTurnPanel(campaign)}
        </div>
        <aside class="stack game-side">
          ${renderGameStatus(campaign)}
          ${renderInteractionPanel(campaign)}
          ${renderTurnLog(campaign)}
        </aside>
      </div>
    </section>
  `;
}

function renderCombatCockpit(campaign, currentDraft) {
  return `
    <section class="combat-screen">
      ${renderTopHud(campaign)}
      <div class="cockpit-core">
        
        <!-- Left Rail: Heroes -->
        <aside class="cockpit-left">
          ${renderCharacterPilot("juanete", "Juanete")}
          ${renderCharacterPilot("ironmole", "Ironmole")}
        </aside>
        
        <!-- Center: Arena -->
        <main class="cockpit-center">
          <div class="gm-narration">
            <p>${escapeHtml(cleanGmNarration(currentDraft.visibleTurnText))}</p>
          </div>
          ${renderEncounterArena(campaign)}
        </main>
        
        <!-- Right: Assists & Logs -->
        <aside class="cockpit-right">
          ${campaign.activeOutGameMission ? renderRitualGate(campaign.activeOutGameMission, ui.llmBusy) : ""}
          <div class="plate" style="padding: var(--space-3);">
            <h3 style="margin-bottom: var(--space-2); color: var(--color-parchment-100); font-family: var(--font-epic);">Epicurogotchi</h3>
            <p class="lore-text" style="font-size: 0.8rem; margin-bottom: var(--space-3);">Consult the artifact for deep inventory and persistent boons.</p>
            <a href="${EPICUROGOTCHI_SHEET_URL}" class="artifact-link" target="_blank">
              ${icon("external-link")} Open Sheet
            </a>
          </div>
          ${renderVanaheimAssists(campaign)}
          ${renderTurnLog(campaign, true)}
        </aside>
        
        <!-- Bottom: Action Command Bar -->
        <div class="cockpit-bottom">
           ${renderCockpitActionSelectors(campaign, currentDraft)}
        </div>

      </div>
    </section>
  `;
}

function renderTopHud(campaign) {
  const encounter = campaign.activeEncounter;
  const mission = campaign.activeOutGameMission;
  const threat = encounter?.combatState?.threatClock ?? "-";
  const pet = getActiveEpicurogotchi(state);
  return `
    <div class="cockpit-hud">
      <div class="hud-segment">
        <span class="label">Turn ${campaign.turnNumber}/${campaign.maxTurns}${campaign.mechanicalResults?.unresolved ? " unresolved" : ""}</span>
        <span class="stat-val" style="font-size: 1.1rem; margin-top: 0;">${escapeHtml(campaign.phase)}</span>
      </div>
      <div class="hud-segment" style="align-items: center;">
        <span class="label">Combat Threat</span>
        <span class="stat-val" style="font-size: 1.1rem; margin-top: 0; color: var(--color-blood-700);">${escapeHtml(threat)}</span>
      </div>
      <div class="hud-segment" style="align-items: center;">
        <span class="label">Ritual Gate</span>
        <span class="stat-val" style="font-size: 1.1rem; margin-top: 0; color: var(--color-gold-400);">${mission ? (mission.completed ? "Done" : "Open") : "None"}</span>
      </div>
      <div class="hud-segment" style="align-items: flex-end;">
        <span class="label">Piccolo</span>
        <span class="stat-val" style="font-size: 1.1rem; margin-top: 0;">Lv ${pet.level}</span>
      </div>
    </div>
  `;
}

function renderCharacterPilot(actor, label) {
  const character = state.characters[actor];
  if (!character) return "";
  const hpPercent = Math.max(0, Math.min(100, Math.round((character.hp / Math.max(1, character.maxHp)) * 100)));
  const isIronmole = actor === "ironmole";
  return `
    <div class="hero-card ${isIronmole ? "ironmole" : ""}">
      <h3 style="margin-bottom: 4px;">${escapeHtml(label)}</h3>
      <p class="label">${escapeHtml(character.className)}</p>
      
      <div style="margin-top: var(--space-2);">
        <div class="split">
          <span class="label">HP</span>
          <span class="label" style="color: ${isIronmole ? 'var(--color-parchment-100)' : 'var(--color-gold-400)'};">${character.hp} / ${character.maxHp}</span>
        </div>
        <div class="resource-track">
          <div class="resource-fill ${isIronmole ? '' : 'hp-juanete'}" style="width: ${hpPercent}%;"></div>
        </div>
      </div>
      
      <div class="stat-grid compact" style="margin-top: var(--space-3);">
        ${Object.entries(character.stats || {}).map(([stat, value]) => `
          <div class="stat-box" style="text-align: center;">
            <span class="label">${escapeHtml(stat).substring(0,3)}</span>
            <strong class="stat-val" style="font-size: 1.2rem;">${value}</strong>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderEncounterArena(campaign) {
  const encounter = campaign.activeEncounter;
  const state = encounter.combatState || {};
  return `
    <div class="enemy-arena">
       <div class="enemy-intent">Targeting: ${escapeHtml(encounter.target)}</div>
       ${encounter.enemies.map((enemy) => {
         const hpPercent = Math.max(0, Math.min(100, Math.round((enemy.hp / Math.max(1, enemy.maxHp)) * 100)));
         return `
           <div class="enemy-card ${enemy.hp <= 0 ? "is-defeated" : ""}" style="width: 80%; text-align: center;">
             <h2 style="color: var(--color-blood-700); margin-bottom: 4px;">${escapeHtml(enemy.name)}</h2>
             <p class="label" style="margin-bottom: var(--space-3);">Objective: ${escapeHtml(encounter.objective)}</p>
             
             <div style="width: 100%; max-width: 300px; margin: 0 auto;">
               <div class="split">
                 <span class="label">Vanguard HP</span>
                 <span class="label">${enemy.hp} / ${enemy.maxHp}</span>
               </div>
               <div class="resource-track" style="height: 12px;">
                 <div class="resource-fill hp-enemy" style="width: ${hpPercent}%;"></div>
               </div>
             </div>
             <p class="meta" style="margin-top: var(--space-2);">${escapeHtml(enemy.condition)}</p>
           </div>
         `;
       }).join("")}
       <p class="lore-text" style="font-size: 0.9rem; margin-top: var(--space-4); opacity: 0.8; text-align: center;">
         GM Intent: ${escapeHtml(state.enemyIntent || "Press the heroes until the scene breaks.")}
       </p>
    </div>
  `;
}

function renderCockpitActionSelectors(campaign, currentDraft) {
  const disabled = !currentDraft || ui.llmBusy;
  const options = currentDraft ? getActionOptions(currentDraft) : { juanete: [], ironmole: [] };
  
  const mission = campaign.activeOutGameMission;
  const ritualRequired = Boolean(mission && mission.status === "required");
  const ritualDone = !ritualRequired || mission.completed || ui.ritualComplete;
  const rollGate = getTurnRollGate(campaign);
  const resolveDisabled = disabled || !ritualDone || !rollGate.ok;
  
  const challenge = currentDraft?.challengeSignal || {};
  const target = campaign.activeEncounter?.target || targetForDifficulty(challenge.difficultyBand || "normal", campaign.turnNumber);

  return `
    <div style="display: flex; gap: var(--space-4); flex: 1;">
      <!-- Juanete Select -->
      <div style="display: flex; flex-direction: column; flex: 1;">
        <span class="label" style="margin-bottom: 4px;">Juanete's Action</span>
        <div class="choice-column" style="display: flex; flex-direction: row; gap: 8px;">
          ${options.juanete.map((item) => `
             <button class="btn secondary" style="flex:1; padding: 8px; font-size: 0.7rem; font-family: var(--font-mech); ${ui.selectedActions['juanete'] === item.label ? 'background: var(--color-ember-500); color: var(--color-abyss-900); border-color: var(--color-ember-500);' : ''}" 
                     data-action-option="juanete" data-option-label="${escapeHtml(item.label)}" ${disabled ? "disabled" : ""}>
               ${escapeHtml(item.label)}
             </button>
          `).join("")}
        </div>
      </div>
      <!-- Ironmole Select -->
      <div style="display: flex; flex-direction: column; flex: 1;">
        <span class="label" style="margin-bottom: 4px;">Ironmole's Action</span>
        <div class="choice-column" style="display: flex; flex-direction: row; gap: 8px;">
          ${options.ironmole.map((item) => `
             <button class="btn secondary" style="flex:1; padding: 8px; font-size: 0.7rem; font-family: var(--font-mech); ${ui.selectedActions['ironmole'] === item.label ? 'background: var(--color-ember-500); color: var(--color-abyss-900); border-color: var(--color-ember-500);' : ''}" 
                     data-action-option="ironmole" data-option-label="${escapeHtml(item.label)}" ${disabled ? "disabled" : ""}>
               ${escapeHtml(item.label)}
             </button>
          `).join("")}
        </div>
      </div>
    </div>
    
    <div style="display: flex; gap: var(--space-3); align-items: center;">
      <div style="text-align: right; margin-right: var(--space-3);">
        <p class="label">Roll Target</p>
        <p class="mech-text" style="color: var(--color-ember-300);">DC ${target}</p>
      </div>
      
      <!-- Physical Dice Rolls -->
      <button class="die-roll" data-action="roll-action" data-actor="juanete" title="Roll Juanete" ${disabled || !ui.selectedActions.juanete ? "disabled" : ""}>
        <span>${ui.rolls.juanete ? ui.rolls.juanete.total : "J"}</span>
      </button>
      <button class="die-roll" data-action="roll-action" data-actor="ironmole" title="Roll Ironmole" style="border-color: var(--color-gold-400); color: var(--color-gold-400);" ${disabled || !ui.selectedActions.ironmole ? "disabled" : ""}>
        <span>${ui.rolls.ironmole ? ui.rolls.ironmole.total : "I"}</span>
      </button>

      <button class="btn btn-large" data-action="resolve-game-turn" ${resolveDisabled ? "disabled" : ""}>
        ${ui.llmBusy ? "Resolving..." : "Resolve Turn"}
      </button>
    </div>
  `;
}

function renderVanaheimAssists(campaign) {
  const companions = Object.values(state.characters.vanaheim || {});
  return `
    <div class="plate" style="padding: var(--space-3);">
      <span class="label">Vanaheim Assists</span>
      <div class="assist-grid">
        ${companions.map((companion) => `
          <div class="assist-card">
            <strong style="font-family: var(--font-epic); font-size: 0.9rem;">${escapeHtml(companion.name.split(" ")[0])}</strong>
            <span class="meta" style="font-size: 0.7rem;">${escapeHtml(companion.sphere)}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderEpicurogotchiPrelude(campaign) {
  return `
    <section class="screen">
      <div class="screen-header">
        <div>
          <span class="label">Turn 0 / Epicurogotchi sheet</span>
          <h2 class="screen-title" style="border:none;">${escapeHtml(campaign.title)}</h2>
          <p class="screen-copy">Before the GM opens Turn 1, the heroes visit the Epicurogotchi sheet to check Piccolo, levels, discoveries, and possible new rituals.</p>
        </div>
      </div>
      <div class="grid two game-table">
        <div class="plate scene-panel">
          <div class="prelude-body">
            <span class="label">Zeroth turn</span>
            <h3 class="panel-title">Open Piccolo's Sheet</h3>
            <p class="lore-text">This is not an LLM step. It is the table ignition before play: review the sheet, note Epicurogotchi level, and bring any discovered rituals back into the campaign.</p>
            <a class="sheet-card" href="${EPICUROGOTCHI_SHEET_URL}" target="_blank" rel="noopener noreferrer">
              <span>${icon("external-link")} Google Sheet</span>
              <strong style="font-family: var(--font-epic); font-size: 1.2rem; margin-top: 8px;">Epicurogotchi / Ritual Source</strong>
              <small class="meta">Opens the living sheet in Google Drive.</small>
            </a>
            <label class="ritual-check mini-check" style="margin-top: var(--space-4);">
              <input type="checkbox" data-input="prelude-ready" ${ui.ritualComplete ? "checked" : ""}>
              <span>
                <strong>Piccolo sheet reviewed</strong>
                <small class="meta" style="display:block;">Level, form, and ritual discoveries are ready for Turn 1.</small>
              </span>
            </label>
            <button class="btn btn-large" style="margin-top: var(--space-4);" data-action="ignite-turn-one" ${ui.ritualComplete || campaign.epicurogotchiReady ? "" : "disabled"}>${icon("flame")} Ignite Turn One</button>
          </div>
        </div>
        <aside class="stack game-side">
          ${renderGameStatus(campaign)}
          <div class="plate">
            <span class="label">What to bring back</span>
            <h3 class="panel-title">Sheet Notes</h3>
            <div class="card-list" style="margin-top: var(--space-4);">
              <div class="item-card"><h4 class="item-title">Epicurogotchi level</h4><p class="meta">Use the sheet as the source of truth for Piccolo before the run.</p></div>
              <div class="item-card"><h4 class="item-title">New rituals</h4><p class="meta">Anything found there can later enter the Ritual Library.</p></div>
              <div class="item-card"><h4 class="item-title">Campaign omen</h4><p class="meta">The first scene should react to Piccolo's current state.</p></div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  `;
}

function renderCurrentScene(campaign, currentDraft) {
  if (ui.llmBusy && !currentDraft) {
    return `
      <div class="plate scene-panel">
        <span class="label">GM is opening the table</span>
        <h3 class="panel-title">Piccolo is listening...</h3>
        <p class="lore-text" style="margin-top: var(--space-3);">The campaign is being narrated now. This should only take a moment.</p>
      </div>
    `;
  }
  if (!currentDraft) {
    const hasStarted = campaign.turns.length > 0;
    return `
      <div class="plate scene-panel">
        <span class="label">Turn ${campaign.turnNumber}/${campaign.maxTurns}</span>
        <h3 class="panel-title">${hasStarted ? "The Next Scene Is Waiting" : "Begin the Campaign"}</h3>
        <p class="lore-text" style="margin-top: var(--space-3);">${hasStarted ? "The last turn is saved in the log. Open the next scene to keep playing." : "The campaign exists, but the first scene is not open yet."}</p>
        ${ui.llmError ? `<div class="status-note error" style="margin-top: var(--space-3);">${escapeHtml(ui.llmError)}</div>` : ""}
        <button class="btn" style="margin-top: var(--space-4);" data-action="start-campaign">${icon("sparkles")} ${hasStarted ? `Generate Turn ${campaign.turnNumber}` : "Start Turn One"}</button>
      </div>
    `;
  }
  const sceneText = cleanGmNarration(currentDraft.visibleTurnText);
  return `
    <article class="plate scene-panel">
      <div class="split">
        <div>
          <span class="label">Scene</span>
          <h3 class="panel-title">Turn ${currentDraft.turnNumber}/${campaign.maxTurns}</h3>
        </div>
        <span class="pill hot">${escapeHtml(currentDraft.challengeSignal?.challengeType || "scene")}</span>
      </div>
      <p class="scene-text">${escapeHtml(sceneText)}</p>
    </article>
  `;
}

function renderPlayerTurnPanel(campaign, showRitual = true) {
  const disabled = !campaign.currentTurnDraft || ui.llmBusy;
  const draft = campaign.currentTurnDraft;
  const options = draft ? getActionOptions(draft) : { juanete: [], ironmole: [] };
  const mission = campaign.activeOutGameMission;
  const ritualRequired = Boolean(mission && mission.status === "required");
  const ritualDone = !ritualRequired || mission.completed || ui.ritualComplete;
  const rollGate = getTurnRollGate(campaign);
  const resolveDisabled = disabled || !ritualDone || !rollGate.ok;
  return `
    <div class="plate">
      <span class="label">Your move</span>
      <h3 class="panel-title">Choose Actions</h3>
      ${mission && showRitual ? renderRitualGate(mission, disabled) : ""}
      <div class="choice-grid">
        ${renderActionColumn("juanete", "Juanete", options.juanete, disabled)}
        ${renderActionColumn("ironmole", "Ironmole", options.ironmole, disabled)}
      </div>
      <details class="optional-write">
        <summary>${icon("pencil")} Write a custom action</summary>
        <div class="form-grid" style="margin-top: var(--space-4);">
          <div class="field">
            <label for="juaneteAction">Juanete custom</label>
            <textarea id="juaneteAction" data-input="juanete-action" placeholder="Optional override for Juanete." ${disabled ? "disabled" : ""}>${escapeHtml(ui.customActions.juanete || "")}</textarea>
          </div>
          <div class="field">
            <label for="ironmoleAction">Ironmole custom</label>
            <textarea id="ironmoleAction" data-input="ironmole-action" placeholder="Optional override for Ironmole." ${disabled ? "disabled" : ""}>${escapeHtml(ui.customActions.ironmole || "")}</textarea>
          </div>
          <div class="field full">
            <label for="tableNotes">Table notes</label>
            <textarea id="tableNotes" data-input="table-notes" placeholder="Optional proof, tone, tactical intent, or shared decision." ${disabled ? "disabled" : ""}>${escapeHtml(ui.customActions.notes || "")}</textarea>
          </div>
        </div>
      </details>
      ${!disabled && !rollGate.ok ? `<div class="status-note warn" style="margin-top: var(--space-4);">${escapeHtml(rollGate.reason)}</div>` : ""}
      ${ui.llmError ? `<div class="status-note error" style="margin-top: var(--space-4);">${escapeHtml(ui.llmError)}</div>` : ""}
      <div style="display: flex; gap: var(--space-3); margin-top: var(--space-4);">
        <button class="btn btn-large" data-action="resolve-game-turn" ${resolveDisabled ? "disabled" : ""}>${icon("sparkles")} ${ui.llmBusy ? "Resolving..." : "Resolve Turn"}</button>
        <button class="btn secondary" data-action="refresh-scene" ${ui.llmBusy ? "disabled" : ""}>${icon("rotate-cw")} Regenerate Scene</button>
      </div>
    </div>
  `;
}

function splitGmScene(text) {
  const labels = ["RESOLUCION", "ESCENA", "ESTADO TACTICO", "OUT-GAME", "ACCIONES POSIBLES", "MECANICA"];
  const source = String(text || "");
  const normalized = normalizeText(source);
  const positions = labels.map((label) => ({ label, index: normalized.indexOf(label) })).filter((item) => item.index >= 0).sort((a, b) => a.index - b.index);
  if (!positions.length) {
    return [{ key: "scene", label: "Scene", text: source || "The scene is not open yet." }];
  }
  return positions.map((item, index) => {
    const start = item.index + item.label.length;
    const end = positions[index + 1]?.index ?? source.length;
    return {
      key: item.label.toLowerCase(),
      label: item.label.replace("TACTICO", "TACTICO"),
      text: source.slice(start, end).replace(/^[:\s]+/, "").trim()
    };
  }).filter((section) => section.text);
}

function cleanGmNarration(text) {
  const source = String(text || "").trim();
  const sections = splitGmScene(source).filter((section) => section.key !== "acciones posibles");
  if (!sections.length || sections[0]?.key === "scene") return source || "The GM has not spoken yet.";
  return sections.map((section) => section.text).filter(Boolean).join("\n\n");
}

function getActionOptions(draft) {
  const payloadOptions = draft?.actionOptions || draft?.gmPayload?.actionOptions;
  if (payloadOptions?.juanete?.length || payloadOptions?.ironmole?.length) {
    return {
      juanete: normalizeActionOptions(payloadOptions.juanete, "juanete"),
      ironmole: normalizeActionOptions(payloadOptions.ironmole, "ironmole")
    };
  }
  return fallbackActionOptions(draft?.visibleTurnText || "");
}

function normalizeActionOptions(items = [], actor) {
  return items.slice(0, 3).map((item, index) => ({
    id: item.id || `${actor}-${index + 1}`,
    label: item.label || item.intent || `Option ${index + 1}`,
    stat: item.stat || "",
    intent: item.intent || ""
  }));
}

function fallbackActionOptions(text) {
  const sections = splitGmScene(text);
  const actionText = sections.find((section) => section.key === "acciones posibles")?.text || "";
  const juanetePart = actionText.split(/Ironmole\s*:/i)[0].replace(/Juanete\s*:/i, "");
  const ironmolePart = actionText.split(/Ironmole\s*:/i)[1] || "";
  return {
    juanete: linesToOptions(juanetePart, "juanete"),
    ironmole: linesToOptions(ironmolePart, "ironmole")
  };
}

function linesToOptions(text, actor) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/(\d+[\).:])/g, "\n$1")
    .split("\n")
    .map((line) => line.trim().replace(/^\d+[\).:]\s*/, "").replace(/^[-•]\s*/, ""))
    .filter(Boolean)
    .slice(0, 3)
    .map((label, index) => ({ id: `${actor}-${index + 1}`, label, stat: "", intent: label }));
}

function renderActionColumn(actor, label, items, disabled) {
  const selected = ui.selectedActions[actor] || "";
  return `
    <div class="choice-column">
      <span class="label">${escapeHtml(label)}</span>
      ${items.length ? items.map((item) => `
        <button class="action-choice ${selected === item.label ? "is-selected" : ""}" data-action-option="${actor}" data-option-label="${escapeHtml(item.label)}" ${disabled ? "disabled" : ""}>
          <strong>${escapeHtml(item.label)}</strong>
          ${item.stat ? `<small>${escapeHtml(item.stat)}</small>` : ""}
          ${item.intent && item.intent !== item.label ? `<span>${escapeHtml(item.intent)}</span>` : ""}
        </button>
      `).join("") : `<div class="status-note">Choose a custom action for ${escapeHtml(label)}.</div>`}
    </div>
  `;
}

function renderRitualGate(mission, disabled) {
  const ritual = mission.ritual;
  const checked = mission.completed || ui.ritualComplete;
  return `
    <div class="ritual-gate ${checked ? "is-complete" : ""}">
      <div>
        <span class="label">External seal</span>
        <h4 style="margin: 4px 0;">${escapeHtml(ritual.title)}</h4>
        <p class="lore-text" style="font-size: 0.9rem;">${escapeHtml(ritual.description)}</p>
        <div class="pill-row">
          <span class="pill hot">${escapeHtml(ritual.size)}</span>
          <span class="pill">${escapeHtml(ritual.sphere)}</span>
          <span class="pill ${checked ? 'cool' : 'danger'}">${checked ? "complete" : "blocks resolve"}</span>
        </div>
      </div>
      <label class="ritual-check">
        <input type="checkbox" data-input="ritual-complete" ${checked ? "checked" : ""} ${disabled || mission.completed ? "disabled" : ""}>
        <span>Complete</span>
      </label>
      <div class="field full" style="grid-column: 1 / -1; margin-top: var(--space-2);">
        <label for="ritualProof">Proof note</label>
        <textarea id="ritualProof" data-input="ritual-proof" placeholder="Short note about the proof at the table." ${disabled || mission.completed ? "disabled" : ""}>${escapeHtml(ui.ritualProof || mission.proofNote || "")}</textarea>
      </div>
    </div>
  `;
}

function renderGameStatus(campaign) {
  const mission = campaign.activeOutGameMission;
  return `
    <div class="plate">
      <span class="label">Run</span>
      <h3 class="panel-title">${escapeHtml(campaign.phase)}</h3>
      <div class="metric-strip" style="margin-top: var(--space-4);">
        ${metric("Turn", `${campaign.turnNumber}/${campaign.maxTurns}`)}
        ${metric("Ritual", mission ? (mission.completed ? "done" : "open") : "none")}
        ${metric("Combat", campaign.activeEncounter ? "active" : "none")}
        ${metric("Map", campaign.campaignMapStatus || (campaign.campaignMap ? "ready" : "none"))}
      </div>
      <div class="character-state-grid" style="margin-top: var(--space-4);">
        ${renderCharacterState("juanete", "Juanete")}
        ${renderCharacterState("ironmole", "Ironmole")}
      </div>
    </div>
  `;
}

function renderCharacterState(actor, label) {
  const character = state.characters[actor];
  if (!character) return "";
  const stats = Object.entries(character.stats || {}).map(([stat, value]) => `<span class="pill">${escapeHtml(stat).substring(0,3)} ${value} (${modifierFor(value) >= 0 ? "+" : ""}${modifierFor(value)})</span>`).join("");
  const abilities = character.abilities?.length ? character.abilities.join(", ") : "base class kit";
  const equipment = character.items?.length ? character.items.join(", ") : "starter equipment";
  return `
    <div class="character-state">
      <div class="split">
        <h4 style="margin:0;">${escapeHtml(label)}</h4>
        <span class="pill hot">HP ${character.hp}/${character.maxHp}</span>
      </div>
      <p class="meta" style="margin-bottom: var(--space-2);">${escapeHtml(character.className)} - ${escapeHtml(character.resource)} / ${escapeHtml(character.tendency)}</p>
      <div class="pill-row">${stats}</div>
      <p class="meta" style="margin-top: var(--space-2);"><strong>Abilities:</strong> ${escapeHtml(abilities)}</p>
      <p class="meta"><strong>Equipment:</strong> ${escapeHtml(equipment)}</p>
    </div>
  `;
}

function renderInteractionPanel(campaign) {
  const encounter = campaign.activeEncounter;
  const challenge = campaign.currentTurnDraft?.challengeSignal || {};
  const target = encounter?.target || targetForDifficulty(challenge.difficultyBand || "normal", campaign.turnNumber);
  const turnType = challenge.challengeType || "scene";
  return `
    <div class="plate">
      <div class="split">
        <div>
          <span class="label">Action</span>
          <h3 class="panel-title">${encounter ? escapeHtml(encounter.title) : "Roll the Scene"}</h3>
        </div>
        <span class="pill hot">Target ${target}</span>
      </div>
      ${encounter ? `
        <p class="lore-text" style="margin-top: var(--space-2);">${escapeHtml(encounter.objective)}</p>
        <div class="card-list" style="margin-top: var(--space-4);">
          ${encounter.enemies.map((enemy) => `
            <div class="item-card is-live">
              <div class="split">
                <h4 class="item-title">${escapeHtml(enemy.name)}</h4>
                <span class="pill">HP ${enemy.hp}/${enemy.maxHp}</span>
              </div>
              <p class="meta">${escapeHtml(enemy.condition)}</p>
            </div>
          `).join("")}
        </div>
      ` : `
        <p class="lore-text" style="margin-top: var(--space-2);">${campaign.currentTurnDraft ? `${escapeHtml(turnType)} turn. Choose actions, roll, resolve.` : "Open the next scene to act."}</p>
      `}
      ${renderRollCards(campaign)}
      ${encounter ? renderTimingGame(encounter) : ""}
    </div>
  `;
}

function renderRollCards(campaign) {
  if (!campaign.currentTurnDraft) return "";
  return `
    <div class="roll-grid" style="margin-top: var(--space-4);">
      ${renderRollCard(campaign, "juanete", "Juanete")}
      ${renderRollCard(campaign, "ironmole", "Ironmole")}
    </div>
  `;
}

function renderRollCard(campaign, actor, label) {
  const action = getActorAction(campaign, actor);
  const roll = ui.rolls[actor];
  const needsDamage = campaign.activeEncounter && roll?.hit && !roll.damage && roll.total >= roll.target;
  const stat = action.stat || campaign.currentTurnDraft?.challengeSignal?.primaryStat || "Fuerza";
  const character = state.characters[actor];
  const statValue = character?.stats?.[stat] ?? 10;
  const modifier = modifierFor(statValue);
  const target = campaign.activeEncounter?.target || targetForDifficulty(campaign.currentTurnDraft?.challengeSignal?.difficultyBand || "normal", campaign.turnNumber);
  return `
    <div class="roll-card ${roll ? "has-roll" : ""}">
      <div>
        <span class="label">${escapeHtml(label)}</span>
        <h4 style="margin: 4px 0;">${escapeHtml(action.label || "Choose an action first")}</h4>
        <p class="meta">${escapeHtml(stat)} ${statValue} (${modifier >= 0 ? "+" : ""}${modifier}) vs ${target}</p>
      </div>
      ${roll ? `
        <div class="roll-result">
          <strong>${roll.total}</strong>
          <span style="font-family: var(--font-mech); font-size: 0.7rem; color: var(--color-parchment-400);">d20 ${roll.d20} ${roll.modifier >= 0 ? "+" : ""}${roll.modifier}</span>
          <small style="display:block; font-family: var(--font-mech); font-size: 0.65rem; color: var(--color-ember-300); text-transform: uppercase;">${escapeHtml(roll.outcome)}</small>
          ${roll.damage ? `<small style="display:block; font-family: var(--font-mech); font-size: 0.65rem; color: var(--color-blood-700); text-transform: uppercase;">dmg ${roll.damage.total}</small>` : ""}
        </div>
      ` : ""}
      <button class="btn secondary dice-button" data-action="roll-action" data-actor="${actor}" ${action.label && (!roll || needsDamage) ? "" : "disabled"}>${icon("dice-5")} ${needsDamage ? "Roll damage" : roll ? "Rolled" : "Roll hit"}</button>
    </div>
  `;
}

function getActorAction(campaign, actor) {
  const custom = (ui.customActions[actor] || "").trim();
  const selected = ui.selectedActions[actor] || "";
  const options = getActionOptions(campaign.currentTurnDraft || {})[actor] || [];
  const option = options.find((item) => item.label === selected);
  const label = custom || option?.label || selected || "";
  return {
    label,
    stat: normalizeStatName(option?.stat || campaign.currentTurnDraft?.challengeSignal?.primaryStat || "Fuerza"),
    intent: custom ? "Custom table action" : option?.intent || label
  };
}

function normalizeStatName(stat) {
  const wanted = normalizeText(stat);
  const candidate = ["Fuerza", "Inteligencia", "Carisma", "Magnetismo"].find((item) => normalizeText(item) === wanted);
  return candidate || "Fuerza";
}

function getTurnRollGate(campaign) {
  if (!campaign?.currentTurnDraft) return { ok: false, reason: "Open the scene before choosing actions." };
  const missingActions = ["juanete", "ironmole"].filter((actor) => !getActorAction(campaign, actor).label);
  if (missingActions.length) return { ok: false, reason: "Choose one action for Juanete and one action for Ironmole." };
  const missingRolls = ["juanete", "ironmole"].filter((actor) => !ui.rolls[actor]);
  if (missingRolls.length) return { ok: false, reason: "Roll a d20 for each chosen character action." };
  if (campaign.activeEncounter) {
    const missingDamage = ["juanete", "ironmole"].filter((actor) => ui.rolls[actor]?.hit && ui.rolls[actor].total >= ui.rolls[actor].target && !ui.rolls[actor].damage);
    if (missingDamage.length) return { ok: false, reason: "Roll damage for successful combat hits." };
  }
  return { ok: true, reason: "" };
}

function rollActorAction(campaign, actor) {
  const action = getActorAction(campaign, actor);
  if (!action.label) {
    showToast("Choose an action before rolling");
    return;
  }
  const character = state.characters[actor];
  const stat = action.stat || campaign.currentTurnDraft?.challengeSignal?.primaryStat || "Fuerza";
  const statValue = character?.stats?.[stat] ?? 10;
  const modifier = modifierFor(statValue);
  const target = campaign.activeEncounter?.target || targetForDifficulty(campaign.currentTurnDraft?.challengeSignal?.difficultyBand || "normal", campaign.turnNumber);
  if (campaign.activeEncounter && ui.rolls[actor]?.hit && !ui.rolls[actor].damage) {
    const damageDie = Math.floor(Math.random() * 8) + 1;
    const damageTotal = Math.max(1, damageDie + Math.max(0, modifier));
    const enemy = campaign.activeEncounter.enemies.find((item) => item.hp > 0);
    if (enemy) {
      enemy.hp = Math.max(0, enemy.hp - damageTotal);
      enemy.condition = enemy.hp <= 0 ? "defeated" : "wounded";
    }
    ui.rolls[actor].damage = { die: damageDie, modifier: Math.max(0, modifier), total: damageTotal, targetEnemy: enemy?.name || "" };
    saveState(state);
    render();
    return;
  }
  const d20 = rollD20();
  const total = d20 + modifier;
  const outcome = total >= target + 5 ? "strong success" : total >= target ? "success" : total >= target - 3 ? "mixed cost" : "failure with consequence";
  ui.rolls[actor] = {
    actor,
    action: action.label,
    stat,
    statValue,
    modifier,
    d20,
    total,
    target,
    outcome,
    hit: Boolean(campaign.activeEncounter)
  };
  render();
}

function renderTimingGame(encounter) {
  const score = encounter.minigame?.score;
  return `
    <div class="timing-game" style="margin-top: var(--space-4);">
      <span class="label">Optional bonus</span>
      <div class="timing-track">
        <div class="timing-target"></div>
        <div class="timing-marker" style="--marker-x:${ui.timing.marker}%"></div>
      </div>
      <div style="display: flex; gap: var(--space-3); align-items: center; margin-top: var(--space-2);">
        <button class="btn secondary" data-action="${ui.timing.active ? "strike-score" : "start-score"}">${icon(ui.timing.active ? "crosshair" : "sparkle")} ${ui.timing.active ? "Take bonus" : "Try bonus"}</button>
        ${score ? `<span class="pill hot">Bonus ${score}: ${escapeHtml(encounter.minigame.resultLabel)}</span>` : `<span class="meta">Optional; d20 rolls are the main resolution.</span>`}
      </div>
    </div>
  `;
}

function renderTurnLog(campaign, compact = false) {
  return `
    <div class="plate" style="${compact ? 'padding: var(--space-3); display: flex; flex-direction: column; flex: 1;' : ''}">
      <span class="label">Log</span>
      <h3 class="panel-title">${compact ? "Scene Log" : "Saved turns"}</h3>
      <div class="${compact ? 'battle-log' : 'log-list'}" style="margin-top: var(--space-4);">
        ${campaign.turns.length ? campaign.turns.slice().reverse().slice(0, compact ? 3 : campaign.turns.length).map((turn) => `
          <div class="${compact ? 'log-entry consequence' : 'turn-log'}">
            <span class="label" style="margin-bottom: 2px;">Turn ${turn.turnNumber}</span>
            <pre style="font-family: var(--font-mech); white-space: pre-wrap; font-size: 0.8rem; color: var(--color-parchment-100); margin: 0;">${escapeHtml(turn.visibleTurnText || "No visible text.")}</pre>
          </div>
        `).join("") : `<div class="empty-state">No turns committed yet.</div>`}
      </div>
    </div>
  `;
}

function renderRituals() {
  const stats = ritualStats(state);
  return `
    <section class="screen">
      <div class="screen-header">
        <div>
          <span class="label">Rituals library</span>
          <h2 class="screen-title" style="border:none;">Tome of Rituals</h2>
          <p class="screen-copy">Out-of-game bindings that unlock narrative gates. Every combat pulls from these pools.</p>
        </div>
      </div>
      <div class="metric-strip" style="margin-bottom: var(--space-5);">
        ${metric("Total", stats.total)}
        ${metric("Micro", stats.micro)}
        ${metric("Macro", stats.macro)}
        ${metric("Spheres", SPHERES.length)}
      </div>
      <div class="grid two">
        <form class="plate" data-form="ritual">
          <div class="form-grid">
            <div class="field full"><label>Title</label><input name="title" required></div>
            <div class="field full"><label>Description</label><textarea name="description" required></textarea></div>
            <div class="field"><label>Sphere</label><select name="sphere">${SPHERES.map((sphere) => `<option value="${sphere.id}">${sphere.name}</option>`).join("")}</select></div>
            <div class="field"><label>Size</label><select name="size">${options(["micro", "macro"], "micro")}</select></div>
            <div class="field"><label>Difficulty</label><select name="difficulty">${options(["easy", "normal", "hard", "boss", "mythic"], "normal")}</select></div>
            <div class="field"><label>Duration</label><input name="duration" placeholder="5-10 min"></div>
            <div class="field"><label>Tone</label><input name="tone" placeholder="focused"></div>
            <div class="field"><label>Reward bias</label><input name="rewardBias" placeholder="resonance"></div>
            <div class="field full"><label>Tags</label><input name="tags" placeholder="food, precision, idea"></div>
            <div class="field full"><label class="mini-check"><input type="checkbox" name="requiresProof" checked><span>Requires proof note</span></label></div>
            <div class="field full" style="margin-top: var(--space-3);"><button class="btn" type="submit">${icon("plus")} Add Ritual</button></div>
          </div>
        </form>
        <div class="plate">
          <span class="label">Pool</span>
          <h3 class="panel-title">Editable rituals</h3>
          <div class="card-list" style="margin-top: var(--space-4);">
            ${state.ritualPools.map((ritual) => `
              <div class="item-card">
                <div class="split">
                  <div>
                    <h4 class="item-title">${escapeHtml(ritual.title)}</h4>
                    <p class="meta" style="margin-top: 4px;">${escapeHtml(ritual.duration)} - ${escapeHtml(ritual.tone)}</p>
                  </div>
                  <button class="icon-button" title="Delete ritual" data-action="delete-ritual" data-id="${ritual.id}">${icon("trash-2")}</button>
                </div>
                <p class="lore-text" style="font-size: 0.9rem; margin-top: var(--space-3);">${escapeHtml(ritual.description)}</p>
                <div class="pill-row">
                  <span class="pill hot">${ritual.size}</span>
                  <span class="pill cool">${ritual.sphere}</span>
                  <span class="pill">${ritual.difficulty}</span>
                  ${(ritual.tags || []).map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("")}
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderEpicurogotchi() {
  const pet = getActiveEpicurogotchi(state);
  return `
    <section class="screen">
      <div class="screen-header">
        <div>
          <span class="label">Epicurogotchi sheet</span>
          <h2 class="screen-title" style="border:none;">${escapeHtml(pet.name)}</h2>
          <p class="screen-copy">One shared pet for Juanete and Ironmole. Discoveries become ritual material and campaign memory.</p>
        </div>
      </div>
      <div class="grid two">
        <div class="plate">
          <div class="hero-art" style="min-height: 420px; border: 1px solid var(--color-abyss-500); border-radius: var(--radius-forged);"><img src="${escapeHtml(pet.image)}" alt="${escapeHtml(pet.name)}"></div>
          <div class="metric-strip" style="margin-top: var(--space-4);">
            ${metric("Level", pet.level)}
            ${metric("Form", pet.form)}
            ${metric("Findings", pet.discoveries.length)}
            ${metric("History", pet.formHistory.length)}
          </div>
          <div style="display: flex; gap: var(--space-3); margin-top: var(--space-4);">
            <button class="btn" data-action="level-pet">${icon("arrow-up")} Level Up</button>
            <label class="btn secondary" style="cursor: pointer;">${icon("image-up")} Image <input data-action="pet-image" type="file" accept="image/*" hidden></label>
          </div>
        </div>
        <div class="plate">
          <span class="label">Enjuanetados</span>
          <h3 class="panel-title">Discoveries</h3>
          <form class="form-grid" data-form="discovery" style="margin-top: var(--space-4);">
            <div class="field full"><label>Title</label><input name="title" required></div>
            <div class="field"><label>Sphere</label><select name="sphere">${SPHERES.map((sphere) => `<option value="${sphere.id}">${sphere.name}</option>`).join("")}</select></div>
            <div class="field"><label>Ritual size</label><select name="ritualSize">${options(["micro", "macro"], "micro")}</select></div>
            <div class="field full"><label>Note</label><textarea name="note"></textarea></div>
            <div class="field full"><button class="btn" type="submit">${icon("plus")} Add Discovery</button></div>
          </form>
          <div class="card-list" style="margin-top: var(--space-4);">
            ${pet.discoveries.length ? pet.discoveries.map((item) => `
              <div class="item-card">
                <h4 class="item-title">${escapeHtml(item.title)}</h4>
                <p class="meta" style="margin-top: 4px;">${escapeHtml(item.sphere)} - ${escapeHtml(item.ritualSize)}</p>
                <p class="lore-text" style="font-size: 0.9rem; margin-top: var(--space-2);">${escapeHtml(item.note)}</p>
                <button class="btn secondary" style="margin-top: var(--space-3);" data-action="discovery-to-ritual" data-id="${item.id}">${icon("flame-kindling")} Convert to Ritual</button>
              </div>
            `).join("") : `<div class="empty-state">No discoveries yet.</div>`}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderMemory() {
  const fileNames = Object.keys(state.memories).sort();
  const selected = state.memories[ui.currentFile] ?? "";
  return `
    <section class="screen">
      <div class="screen-header">
        <div>
          <span class="label">Memory / files</span>
          <h2 class="screen-title" style="border:none;">Virtual Workspace</h2>
          <p class="screen-copy">Markdown lives in browser storage and exports with the campaign bundle.</p>
        </div>
      </div>
      <div class="plate">
        <div class="file-browser">
          <div class="file-list">
            ${fileNames.map((file) => `<button class="file-tab ${file === ui.currentFile ? "is-active" : ""}" data-file="${escapeHtml(file)}">${escapeHtml(file)}</button>`).join("")}
            <button class="btn secondary" style="margin-top: var(--space-3);" data-action="new-file">${icon("file-plus")} New File</button>
          </div>
          <div class="stack">
            <div class="field">
              <label>${escapeHtml(ui.currentFile)}</label>
              <textarea data-input="memory-file" style="min-height: 540px; font-family: var(--font-code); color: var(--color-parchment-300); background: #050505;">${escapeHtml(selected)}</textarea>
            </div>
            <div style="display: flex; gap: var(--space-3);">
              <button class="btn" data-action="save-file">${icon("save")} Save File</button>
              <button class="btn danger" data-action="delete-file">${icon("trash-2")} Delete File</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderBridgecrux() {
  const runs = Array.isArray(state.llmRuns) ? state.llmRuns.slice(-8).reverse() : [];
  const registry = getBridgecruxRegistry(state);
  return `
    <section class="screen">
      <div class="screen-header">
        <div>
          <span class="label">Bridgecrux</span>
          <h2 class="screen-title" style="border:none; color: var(--color-bridgecrux);">Engine Room</h2>
          <p class="screen-copy">Editable run instructions and recent model calls. API keys are never stored here.</p>
        </div>
      </div>
      <div class="plate" style="margin-bottom: var(--space-6); background: #0a0507; border-color: rgba(255,51,102,0.3);">
        <span class="label" style="color: var(--color-bridgecrux);">Latest LLM runs</span>
        <h3 class="panel-title" style="color: var(--color-parchment-100);">Input / Output / Config</h3>
        ${runs.length ? `<div class="llm-run-list" style="margin-top: var(--space-4);">${runs.map(renderLlmRun).join("")}</div>` : `<div class="empty-state">No LLM runs recorded yet.</div>`}
      </div>
      <div class="grid two">
        ${Object.entries(registry).map(([name, content]) => `
          <div class="plate" style="background: #050505;">
            <span class="label" style="color: var(--color-gold-400);">${escapeHtml(name)}</span>
            <pre class="codebox" style="margin-top: var(--space-3); border: none;">${escapeHtml(content)}</pre>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderLlmRun(run) {
  return `
    <details class="llm-run">
      <summary style="color: ${run.validation?.ok ? 'var(--color-success-500)' : 'var(--color-bridgecrux)'};">
        <span>${escapeHtml(run.createdAt || "")}</span>
        <strong>${escapeHtml(run.status || "unknown")} / ${escapeHtml(run.model || run.settings?.modelTier || "model")}</strong>
      </summary>
      <div class="llm-run-body">
        <div class="pill-row">
          <span class="pill">${escapeHtml(run.settings?.modelTier || "")}</span>
          <span class="pill">${escapeHtml(run.settings?.llmMode || "")}</span>
          <span class="pill">thinking ${escapeHtml(run.usedConfig?.thinkingLevel || run.usedConfig?.thinkingBudget || run.settings?.thinkingLevel || run.settings?.thinkingBudget || "")}</span>
          <span class="pill">temp ${escapeHtml(run.settings?.temperature ?? "")}</span>
          <span class="pill">out ${escapeHtml(run.usedConfig?.maxOutputTokens ?? run.settings?.maxOutputTokens ?? "")}</span>
          ${run.fallbackUsed ? `<span class="pill danger">fallback used</span>` : ""}
        </div>
        ${run.fallbackReason ? `<div class="status-note warn">${escapeHtml(run.fallbackReason)}</div>` : ""}
        ${run.error ? `<div class="status-note error">${escapeHtml(run.error)}</div>` : ""}
        ${run.validation ? `<div class="status-note ${run.validation.ok ? "" : "error"}">Validation: ${run.validation.ok ? "ok" : escapeHtml(run.validation.issues?.join(" ") || "failed")}</div>` : ""}
        <div class="grid two">
          <div>
            <span class="label">Prompt input</span>
            <pre class="codebox">${escapeHtml(run.prompt || "")}</pre>
          </div>
          <div>
            <span class="label">Model output</span>
            <pre class="json-block">${escapeHtml(run.output || "")}</pre>
          </div>
        </div>
      </div>
    </details>
  `;
}

/* ==========================================================================
   STATE & LLM LOGIC (Unchanged)
   ========================================================================== */

function settingsForRoute(tier) {
  const route = routeForTier(tier);
  return {
    ...state.settings,
    ...route,
    modelTier: tier,
    llmMode: state.settings.llmMode || "generate-content",
    llmEndpoint: normalizeLlmEndpoint(state.settings.llmEndpoint)
  };
}

function normalizeStoredSettings() {
  const route = routeForTier(state.settings.modelTier || "medium");
  state.settings = {
    ...state.settings,
    thinkingLevel: route.thinkingLevel || state.settings.thinkingLevel || "high",
    thinkingBudget: route.thinkingBudget ?? state.settings.thinkingBudget ?? 16000,
    temperature: route.temperature ?? 0.85,
    maxOutputTokens: route.maxOutputTokens ?? 20000,
    llmEndpoint: normalizeLlmEndpoint(state.settings.llmEndpoint)
  };
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.view = button.dataset.view;
      render();
    });
  });

  document.querySelector("[data-action='save-state']")?.addEventListener("click", () => persist("State saved"));
  document.querySelector("[data-action='export-state']")?.addEventListener("click", () => exportBundle(state));
  document.querySelector("[data-action='import-state']")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      state = await importBundle(file);
      saveState(state);
      showToast("Bundle imported");
    } catch {
      showToast("Import failed: invalid JSON");
    }
  });

  document.querySelector("[data-form='campaign-setup']")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const data = Object.fromEntries(formData.entries());
    data.mandatoryRitualIds = formData.getAll("mandatoryRitualIds");
    const campaign = createCampaign(state, data);
    ui.setupForm = {};
    ui.setupClasses = {};
    state.settings.llmEndpoint = normalizeLlmEndpoint(state.settings.llmEndpoint);
    resetTurnInputs();
    saveState(state);
    ui.view = "play";
    showToast("Campaign forged. Building heavy campaign map...");
    await generateCampaignMap(campaign);
  });

  document.querySelector("[data-action='random-seed']")?.addEventListener("click", async () => {
    await generateRandomSeed();
  });

  document.querySelector("[name='seed']")?.addEventListener("input", (event) => {
    ui.setupSeed = event.currentTarget.value;
  });

  document.querySelector("[name='title']")?.addEventListener("input", (event) => {
    ui.setupTitle = event.currentTarget.value;
  });

  document.querySelectorAll("[data-form='campaign-setup'] select, [data-form='campaign-setup'] input[type='number']").forEach((input) => {
    input.addEventListener("change", (event) => {
      ui.setupForm[event.currentTarget.name] = event.currentTarget.value;
    });
  });

  document.querySelectorAll("[name='juaneteClass'], [name='ironmoleClass']").forEach((input) => {
    input.addEventListener("change", (event) => {
      const playerKey = event.currentTarget.name === "juaneteClass" ? "juanete" : "ironmole";
      ui.setupForm[event.currentTarget.name] = event.currentTarget.value;
      ui.setupClasses[playerKey] = event.currentTarget.value;
      render();
    });
  });

  document.querySelectorAll("[name='mandatoryRitualIds']").forEach((input) => {
    input.addEventListener("change", () => {
      const count = document.querySelectorAll("[name='mandatoryRitualIds']:checked").length;
      const badge = document.querySelector("[data-ritual-count]");
      if (badge) badge.textContent = `${count} selected`;
    });
  });

  document.querySelector("[data-action='complete-ritual']")?.addEventListener("click", () => {
    const campaign = getActiveCampaign(state);
    const proof = document.querySelector("[data-input='proof-note']")?.value || "";
    completeActiveRitual(campaign, proof);
    saveState(state);
    showToast("Ritual completed");
  });

  document.querySelector("[data-action='start-score']")?.addEventListener("click", startTimingGame);
  document.querySelector("[data-action='strike-score']")?.addEventListener("click", strikeTimingGame);

  document.querySelector("[data-action='start-campaign']")?.addEventListener("click", async () => {
    const campaign = getActiveCampaign(state);
    if (campaign?.turnNumber === 0) {
      showToast("Review the Epicurogotchi sheet first");
      return;
    }
    resetTurnInputs();
    await generateGmDraft(campaign, "Start the campaign now. Open with the first playable scene and present actions for Juanete and Ironmole.");
  });

  document.querySelector("[data-action='ignite-turn-one']")?.addEventListener("click", async () => {
    const campaign = getActiveCampaign(state);
    if (!campaign) return;
    campaign.epicurogotchiReady = true;
    campaign.turnNumber = 1;
    campaign.phase = "act1";
    resetTurnInputs();
    saveState(state);
    showToast("Piccolo is ready. Opening turn one...");
    await generateGmDraft(campaign, "Start the campaign now. Open with the first playable scene and present action buttons for Juanete and Ironmole. React to the Epicurogotchi sheet being reviewed in Turn 0.");
  });

  document.querySelector("[data-action='refresh-scene']")?.addEventListener("click", async () => {
    const campaign = getActiveCampaign(state);
    resetTurnInputs();
    await generateGmDraft(campaign, "Regenerate the current scene. Keep the same campaign state, but make the scene more directly playable.");
  });

  document.querySelector("[data-action='resolve-game-turn']")?.addEventListener("click", async () => {
    const campaign = getActiveCampaign(state);
    await resolveGameTurn(campaign);
  });

  document.querySelector(".advanced-panel")?.addEventListener("toggle", (event) => {
    ui.advancedOpen = event.currentTarget.open;
  });

  document.querySelector("[data-input='prelude-ready']")?.addEventListener("change", (event) => {
    ui.ritualComplete = event.currentTarget.checked;
    render();
  });

  document.querySelectorAll("[data-action-option]").forEach((button) => {
    button.addEventListener("click", () => {
      const actor = button.dataset.actionOption;
      ui.selectedActions[actor] = button.dataset.optionLabel || "";
      delete ui.rolls[actor];
      render();
    });
  });

  document.querySelectorAll("[data-action='roll-action']").forEach((button) => {
    button.addEventListener("click", () => {
      rollActorAction(getActiveCampaign(state), button.dataset.actor);
    });
  });

  document.querySelector("[data-input='ritual-complete']")?.addEventListener("change", (event) => {
    ui.ritualComplete = event.currentTarget.checked;
    ui.ritualProof = document.querySelector("[data-input='ritual-proof']")?.value || "";
    render();
  });

  document.querySelector("[data-input='ritual-proof']")?.addEventListener("input", (event) => {
    ui.ritualProof = event.currentTarget.value;
  });

  document.querySelector("[data-input='juanete-action']")?.addEventListener("input", (event) => {
    ui.customActions.juanete = event.currentTarget.value;
    delete ui.rolls.juanete;
  });

  document.querySelector("[data-input='ironmole-action']")?.addEventListener("input", (event) => {
    ui.customActions.ironmole = event.currentTarget.value;
    delete ui.rolls.ironmole;
  });

  document.querySelector("[data-input='table-notes']")?.addEventListener("input", (event) => {
    ui.customActions.notes = event.currentTarget.value;
  });

  document.querySelector("[data-action='build-prompt']")?.addEventListener("click", () => {
    const campaign = getActiveCampaign(state);
    collectLlmSettings();
    ui.playerActions = document.querySelector("[data-input='player-actions']")?.value || "";
    ui.promptOutput = buildPromptBundle(state, campaign, ui.playerActions);
    saveState(state);
    render();
  });

  document.querySelector("[data-action='copy-prompt']")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(ui.promptOutput);
    showToast("Prompt copied");
  });

  document.querySelector("[data-action='use-local-proxy']")?.addEventListener("click", () => {
    if (!isLocalBrowserOrigin()) {
      state.settings.llmEndpoint = "";
      saveState(state);
      showToast("Local proxy is only available on localhost. Using direct Gemini.");
      return;
    }
    state.settings.llmEndpoint = defaultLlmEndpoint();
    saveState(state);
    showToast("Local proxy endpoint selected");
  });

  document.querySelector("[data-action='run-gemini']")?.addEventListener("click", async () => {
    const campaign = getActiveCampaign(state);
    collectLlmSettings();
    ui.playerActions = document.querySelector("[data-input='player-actions']")?.value || "";
    ui.promptOutput = buildPromptBundle(state, campaign, ui.playerActions);
    ui.llmBusy = true;
    ui.llmError = "";
    saveState(state);
    render();
    try {
      const result = await callGemini({
        prompt: ui.promptOutput,
        settings: state.settings,
        apiKey: window.sessionStorage.getItem("tya.gemini.apiKey") || "",
        systemInstruction: buildSystemInstruction(state)
      });
      ui.gmOutput = result.text;
      ui.validation = validateGmOutput(result.text);
      recordLlmRun({ campaign, prompt: ui.promptOutput, result, validation: ui.validation, settings: state.settings });
      if (!ui.validation.ok) {
        const repaired = await repairGmOutput(campaign, ui.promptOutput, result.text, ui.validation);
        if (repaired?.validation?.ok) {
          ui.gmOutput = repaired.result.text;
          ui.validation = repaired.validation;
        }
      }
      if (ui.validation.ok) {
        setCurrentTurnDraft(state, campaign, ui.validation, ui.gmOutput);
        resetTurnInputs();
        saveState(state);
      }
      ui.llmError = "";
      showToast(`Gemini returned ${result.model}`);
    } catch (error) {
      ui.llmError = error.message || "Gemini request failed.";
      recordLlmRun({ campaign, prompt: ui.promptOutput, error, settings: state.settings });
      showToast("Gemini request failed");
    } finally {
      ui.llmBusy = false;
      render();
    }
  });

  document.querySelector("[data-action='validate-gm']")?.addEventListener("click", () => {
    ui.gmOutput = document.querySelector("[data-input='gm-output']")?.value || "";
    ui.validation = validateGmOutput(ui.gmOutput);
    render();
  });

  document.querySelector("[data-action='commit-turn']")?.addEventListener("click", () => {
    const campaign = getActiveCampaign(state);
    ui.gmOutput = document.querySelector("[data-input='gm-output']")?.value || "";
    ui.playerActions = document.querySelector("[data-input='player-actions']")?.value || ui.playerActions;
    const validation = validateGmOutput(ui.gmOutput);
    ui.validation = validation;
    if (!validation.ok) {
      render();
      return;
    }
    const committed = commitTurn(campaign, {
      playerActions: ui.playerActions,
      visibleTurnText: validation.visibleTurnText,
      gmPayload: validation.payload,
      challengeSignal: validation.payload?.challengeSignal,
      stateDeltaProposal: validation.payload?.stateDeltaProposal
    });
    if (!committed.ok) {
      showToast(committed.reason);
      return;
    }
    updateCampaignMemory(campaign);
    ui.gmOutput = "";
    ui.promptOutput = "";
    ui.validation = null;
    saveState(state);
    showToast("Turn committed");
  });

  document.querySelector("[data-form='ritual']")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const data = Object.fromEntries(formData.entries());
    data.requiresProof = formData.get("requiresProof") === "on";
    addRitual(state, data);
    saveState(state);
    showToast("Ritual added");
  });

  document.querySelectorAll("[data-action='delete-ritual']").forEach((button) => {
    button.addEventListener("click", () => {
      deleteRitual(state, button.dataset.id);
      saveState(state);
      showToast("Ritual deleted");
    });
  });

  document.querySelector("[data-action='level-pet']")?.addEventListener("click", () => {
    levelUp(getActiveEpicurogotchi(state), 1);
    saveState(state);
    showToast("Piccolo leveled up");
  });

  document.querySelector("[data-action='pet-image']")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await setPetImageFromFile(getActiveEpicurogotchi(state), file);
    saveState(state);
    showToast("Piccolo image updated");
  });

  document.querySelector("[data-form='discovery']")?.addEventListener("submit", (event) => {
    event.preventDefault();
    addDiscovery(getActiveEpicurogotchi(state), Object.fromEntries(new FormData(event.currentTarget).entries()));
    saveState(state);
    showToast("Discovery added");
  });

  document.querySelectorAll("[data-action='discovery-to-ritual']").forEach((button) => {
    button.addEventListener("click", () => {
      const pet = getActiveEpicurogotchi(state);
      const discovery = pet.discoveries.find((item) => item.id === button.dataset.id);
      if (!discovery) return;
      addRitual(state, {
        title: discovery.title,
        description: discovery.note || "Convert this Enjuanetado into a diegetic ritual.",
        sphere: discovery.sphere,
        size: discovery.ritualSize,
        difficulty: discovery.ritualSize === "macro" ? "hard" : "normal",
        tone: "discovered",
        tags: "enjuanetado, piccolo",
        rewardBias: "discovery",
        requiresProof: true
      });
      saveState(state);
      showToast("Discovery converted to ritual");
    });
  });

  document.querySelectorAll("[data-file]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.currentFile = button.dataset.file;
      render();
    });
  });

  document.querySelector("[data-action='save-file']")?.addEventListener("click", () => {
    state.memories[ui.currentFile] = document.querySelector("[data-input='memory-file']")?.value || "";
    saveState(state);
    showToast("File saved");
  });

  document.querySelector("[data-action='new-file']")?.addEventListener("click", () => {
    const name = window.prompt("New virtual file path", "notes/new-file.md");
    if (!name) return;
    state.memories[name] = `# ${name}\n\n`;
    ui.currentFile = name;
    saveState(state);
    showToast("File created");
  });

  document.querySelector("[data-action='delete-file']")?.addEventListener("click", () => {
    if (ui.currentFile === "memory.md") {
      showToast("memory.md cannot be deleted");
      return;
    }
    delete state.memories[ui.currentFile];
    ui.currentFile = "memory.md";
    saveState(state);
    showToast("File deleted");
  });
}

function collectLlmSettings() {
  const apiKey = document.querySelector("[data-input='gemini-api-key']")?.value || "";
  window.sessionStorage.setItem("tya.gemini.apiKey", apiKey);
  state.settings.modelTier = document.querySelector("[data-input='model-tier']")?.value || state.settings.modelTier || "medium";
  state.settings.llmMode = document.querySelector("[data-input='llm-mode']")?.value || state.settings.llmMode || "generate-content";
  state.settings.thinkingLevel = document.querySelector("[data-input='thinking-level']")?.value || state.settings.thinkingLevel || "high";
  state.settings.thinkingBudget = Number(document.querySelector("[data-input='thinking-budget']")?.value || state.settings.thinkingBudget || 16000);
  state.settings.temperature = Number(document.querySelector("[data-input='temperature']")?.value || state.settings.temperature || 0.85);
  state.settings.maxOutputTokens = Number(document.querySelector("[data-input='max-output-tokens']")?.value || state.settings.maxOutputTokens || 20000);
  state.settings.llmEndpoint = normalizeLlmEndpoint(document.querySelector("[data-input='llm-endpoint']")?.value || "");
}

function safeLlmSettings(settings = state.settings) {
  return {
    modelTier: settings.modelTier,
    llmMode: settings.llmMode,
    thinkingLevel: settings.thinkingLevel,
    thinkingBudget: settings.thinkingBudget,
    temperature: settings.temperature,
    maxOutputTokens: settings.maxOutputTokens,
    llmEndpoint: settings.llmEndpoint
  };
}

function recordLlmRun({ campaign, prompt, result, validation, error, settings }) {
  if (!Array.isArray(state.llmRuns)) state.llmRuns = [];
  state.llmRuns.push({
    id: `llm_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    campaignId: campaign?.id || null,
    turnNumber: campaign?.turnNumber ?? null,
    createdAt: new Date().toISOString(),
    status: error ? "error" : validation?.ok ? "ok" : "repair",
    model: result?.payload?.modelUsed || result?.model || "",
    fallbackUsed: Boolean(result?.payload?.fallbackUsed),
    fallbackReason: result?.payload?.fallbackReason || "",
    usedConfig: result?.payload?.usedConfig || null,
    settings: safeLlmSettings(settings),
    prompt,
    output: result?.text || "",
    validation: validation ? { ok: validation.ok, issues: validation.issues || [] } : null,
    error: error?.message || error || ""
  });
  state.llmRuns = state.llmRuns.slice(-20);
  saveState(state);
}

async function generateRandomSeed() {
  if (ui.seedBusy) return;
  const settings = settingsForRoute("small");
  const registry = getBridgecruxRegistry(state);
  const currentForm = document.querySelector("[data-form='campaign-setup']");
  const formData = currentForm ? Object.fromEntries(new FormData(currentForm).entries()) : {};
  const prompt = [
    registry["universal_system.md"],
    "",
    registry["general-functions.md"],
    "",
    "Genera una semilla de campana para Totumas & Aventuras.",
    "Debe estar en espanol, con titulo, tono raro, aventurero, tactico y jugable.",
    "No escribas ingles. No expliques el formato. Devuelve JSON.",
    "",
    "Contexto de setup:",
    JSON.stringify({
      mode: formData.mode || "canon",
      maxTurns: formData.maxTurns || "20",
      intensity: formData.intensity || "normal",
      combatWeight: formData.combatWeight || "80",
      juaneteClass: formData.juaneteClass || "Bardo",
      ironmoleClass: formData.ironmoleClass || "Artificiero"
    }, null, 2)
  ].join("\n");
  ui.seedBusy = true;
  render();
  try {
    const result = await callGemini({
      prompt,
      settings,
      apiKey: window.sessionStorage.getItem("tya.gemini.apiKey") || "",
      responseJsonSchema: SEED_SCHEMA,
      systemInstruction: `${registry["universal_system.md"]}\n\n${registry["general-functions.md"]}\n\nEres un generador de semillas de campana en espanol para este juego narrativo-tactico. Responde solo JSON valido.`
    });
    const parsed = JSON.parse(result.text);
    ui.setupSeed = parsed.seed || "";
    ui.setupTitle = parsed.title || ui.setupTitle;
    recordLlmRun({ campaign: getActiveCampaign(state), prompt, result, validation: { ok: Boolean(parsed.seed && parsed.title), issues: parsed.seed && parsed.title ? [] : ["Seed or title missing"] }, settings });
    showToast("Semilla generada");
  } catch (error) {
    recordLlmRun({ campaign: getActiveCampaign(state), prompt, error, settings });
    showToast(error.message || "No se pudo generar la semilla");
  } finally {
    ui.seedBusy = false;
    render();
  }
}

async function generateCampaignMap(campaign) {
  if (!campaign || ui.mapBusy) return;
  const settings = settingsForRoute("heavy");
  const prompt = buildCampaignMapPrompt(campaign);
  campaign.campaignMapStatus = "generating";
  ui.mapBusy = true;
  saveState(state);
  render();
  try {
    const result = await callGemini({
      prompt,
      settings,
      apiKey: window.sessionStorage.getItem("tya.gemini.apiKey") || "",
      responseJsonSchema: CAMPAIGN_MAP_SCHEMA,
      systemInstruction: `${buildSystemInstruction(state)}\n\nEres el arquitecto heavy de Totumas & Aventuras. Crea mapas de campana completos en espanol. El codigo posee estadisticas, DCs, HP, rituales y turnos; tu salida debe planear ritmo, escenas, enemigos y rituales por combate usando solo rituales dados.`
    });
    const parsed = JSON.parse(result.text);
    campaign.campaignMap = normalizeCampaignMap(campaign, parsed);
    campaign.campaignMapStatus = "ready";
    state.memories["campaigns/map.json"] = JSON.stringify(campaign.campaignMap, null, 2);
    recordLlmRun({ campaign, prompt, result, validation: { ok: true, issues: [] }, settings });
    saveState(state);
    showToast("Campaign map ready. Open Piccolo's sheet first.");
  } catch (error) {
    campaign.campaignMap = buildFallbackCampaignMap(campaign);
    campaign.campaignMapStatus = "fallback";
    state.memories["campaigns/map.json"] = JSON.stringify(campaign.campaignMap, null, 2);
    recordLlmRun({ campaign, prompt, error, settings });
    saveState(state);
    showToast("Heavy map failed; fallback map created");
  } finally {
    ui.mapBusy = false;
    render();
  }
}

function buildCampaignMapPrompt(campaign) {
  const registry = getBridgecruxRegistry(state);
  return [
    registry["universal_system.md"],
    "",
    registry["general-functions.md"],
    "",
    "Crea el mapa completo de campana para Totumas & Aventuras.",
    "Todo debe estar en espanol. No improvises rituales fuera de la biblioteca.",
    "Cada turno debe tener un beat jugable. Solo los turnos combat o boss deben tener ritualId/ritualTitle.",
    "Para explore/social/ritual sin combate usa ritualId y ritualTitle vacios.",
    "Cada turno debe incluir ritualSize, enemyIntent, outGamePolicy, targetIntensity y rewardHint.",
    "Los enemigos deben venir en enemyBrief con cantidad, tipo, HP sugerido y rasgo tactico; el codigo derivara enemigos concretos.",
    "Usa la semilla, clases, intensidad, peso de combate y cantidad de turnos.",
    "",
    JSON.stringify({
      campaign: {
        title: campaign.title,
        mode: campaign.mode,
        maxTurns: campaign.maxTurns,
        intensity: campaign.intensity,
        combatWeight: campaign.combatWeight,
        seed: campaign.seed,
        selectedClasses: campaign.selectedClasses,
        actMap: campaign.actMap
      },
      pcs: {
        juanete: state.characters.juanete,
        ironmole: state.characters.ironmole
      },
      ritualLibrary: state.ritualPools.map((ritual) => ({
        id: ritual.id,
        title: ritual.title,
        sphere: ritual.sphere,
        size: ritual.size,
        description: ritual.description
      })),
      mandatoryRitualIds: campaign.mandatoryRitualIds || []
    }, null, 2)
  ].join("\n");
}

function normalizeCampaignMap(campaign, map) {
  const turns = Array.isArray(map.turnPlan) ? map.turnPlan : [];
  const combatRituals = state.ritualPools.filter((ritual) => ritual.size === "micro");
  const bossRituals = state.ritualPools.filter((ritual) => ritual.size === "macro");
  const normalized = {
    ...map,
    turnPlan: Array.from({ length: campaign.maxTurns }, (_, index) => {
      const turn = turns.find((item) => Number(item.turn) === index + 1) || {};
      const challengeType = turn.challengeType || (index === campaign.maxTurns - 1 ? "boss" : (index % 4 === 1 ? "combat" : "explore"));
      const needsRitual = ["combat", "boss"].includes(challengeType);
      const validRitual = state.ritualPools.find((ritual) => ritual.id === turn.ritualId);
      const fallbackPool = challengeType === "boss" ? bossRituals : combatRituals;
      const fallbackRitual = fallbackPool[index % Math.max(1, fallbackPool.length)] || null;
      const ritual = needsRitual ? (validRitual || fallbackRitual) : null;
      return {
        turn: index + 1,
        phase: phaseForPlannedTurn(index + 1, campaign.maxTurns),
        beat: turn.beat || `Avance de Vanaheim ${index + 1}`,
        challengeType,
        difficultyBand: turn.difficultyBand || (challengeType === "boss" ? "boss" : "normal"),
        primaryStat: normalizeStatName(turn.primaryStat || "Fuerza"),
        ritualId: ritual?.id || "",
        ritualTitle: ritual?.title || "",
        ritualSize: ritual?.size || "none",
        enemyBrief: turn.enemyBrief || (needsRitual ? "Amenaza con 1-3 enemigos; HP sugerido 10-18; presion tactica clara." : ""),
        enemyIntent: turn.enemyIntent || (needsRitual ? "Presionar HP, posicion y ritmo del grupo." : "Complicar la decision sin abrir combate."),
        outGamePolicy: needsRitual ? (challengeType === "boss" ? "boss-gate" : "combat-only") : "none",
        targetIntensity: turn.targetIntensity || (challengeType === "boss" ? "boss" : turn.difficultyBand === "hard" ? "high" : "medium"),
        rewardHint: turn.rewardHint || "pista, memoria, ventaja o loot menor",
        rewardIntent: turn.rewardIntent || turn.rewardHint || "pista, memoria, ventaja o loot menor"
      };
    })
  };
  const mandatory = (campaign.mandatoryRitualIds || [])
    .map((id) => state.ritualPools.find((ritual) => ritual.id === id))
    .filter(Boolean);
  const usedMandatoryTurns = new Set();
  mandatory.forEach((ritual, index) => {
    const targetTurn = pickMandatoryRitualTurn(normalized.turnPlan, ritual, campaign, index, usedMandatoryTurns);
    if (!targetTurn) return;
    usedMandatoryTurns.add(targetTurn.turn);
    if (!["combat", "boss"].includes(targetTurn.challengeType)) {
      targetTurn.challengeType = ritual.size === "macro" ? "boss" : "combat";
      targetTurn.difficultyBand = ritual.size === "macro" ? "boss" : "normal";
      targetTurn.enemyBrief ||= "Amenaza activada por ritual obligatorio; HP sugerido 10-18; presion tactica clara.";
      targetTurn.enemyIntent ||= "Forzar una prueba concreta antes de que el grupo pueda avanzar.";
      targetTurn.outGamePolicy = ritual.size === "macro" ? "boss-gate" : "combat-only";
    }
    targetTurn.ritualId = ritual.id;
    targetTurn.ritualTitle = ritual.title;
    targetTurn.ritualSize = ritual.size;
    targetTurn.rewardIntent = ritual.rewardBias || targetTurn.rewardIntent;
  });
  return normalized;
}

function stableNumber(value) {
  return String(value || "").split("").reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
}

function pickMandatoryRitualTurn(turnPlan, ritual, campaign, index, usedTurns) {
  const sizeMatches = turnPlan.filter((turn) => {
    if (usedTurns.has(turn.turn)) return false;
    if (ritual.size === "macro") return turn.challengeType === "boss";
    return turn.challengeType === "combat";
  });
  const combatMatches = turnPlan.filter((turn) => ["combat", "boss"].includes(turn.challengeType) && !usedTurns.has(turn.turn));
  const anyPlayable = turnPlan.filter((turn) => turn.turn > 1 && !usedTurns.has(turn.turn));
  const candidates = (sizeMatches.length ? sizeMatches : combatMatches.length ? combatMatches : anyPlayable.length ? anyPlayable : turnPlan.filter((turn) => !usedTurns.has(turn.turn)));
  if (!candidates.length) return null;
  const nonOpening = candidates.length > 1 ? candidates.filter((turn) => turn.turn > 1) : candidates;
  const pool = nonOpening.length ? nonOpening : candidates;
  const seed = Math.abs(stableNumber(`${campaign.id}:${campaign.title}:${ritual.id}:${index}`));
  return pool[seed % pool.length];
}

function phaseForPlannedTurn(turnNumber, maxTurns) {
  const ratio = turnNumber / Math.max(1, maxTurns);
  if (ratio <= 0.2) return "act1";
  if (ratio <= 0.7) return "act2";
  return "act3";
}

function buildFallbackCampaignMap(campaign) {
  return normalizeCampaignMap(campaign, {
    title: campaign.title,
    premise: campaign.seed || "Una primera expedicion hacia Vanaheim.",
    campaignArc: "Entrada, presion, descubrimiento, combate, convergencia y cierre.",
    turnPlan: [],
    antagonistThread: "La friccion de Vanaheim prueba el vinculo de Juanete, Ironmole y Piccolo.",
    vanaheimPressure: ["Din exige ternura bajo presion.", "Hagen exige hipotesis utiles.", "Segismundo exige presencia material.", "Elektra exige forma y deseo."],
    ritualNotes: "Fallback local: rituales asignados desde la biblioteca segun combate."
  });
}

function collectGameActions() {
  const juaneteCustom = document.querySelector("[data-input='juanete-action']")?.value?.trim() || ui.customActions.juanete || "";
  const ironmoleCustom = document.querySelector("[data-input='ironmole-action']")?.value?.trim() || ui.customActions.ironmole || "";
  const notes = document.querySelector("[data-input='table-notes']")?.value?.trim() || ui.customActions.notes || "";
  const juanete = juaneteCustom || ui.selectedActions.juanete || "";
  const ironmole = ironmoleCustom || ui.selectedActions.ironmole || "";
  return [
    juanete ? `Juanete: ${juanete}` : "",
    ironmole ? `Ironmole: ${ironmole}` : "",
    ui.rolls.juanete ? `Juanete roll: d20 ${ui.rolls.juanete.d20} ${ui.rolls.juanete.modifier >= 0 ? "+" : ""}${ui.rolls.juanete.modifier} = ${ui.rolls.juanete.total} vs ${ui.rolls.juanete.target} (${ui.rolls.juanete.outcome})` : "",
    ui.rolls.ironmole ? `Ironmole roll: d20 ${ui.rolls.ironmole.d20} ${ui.rolls.ironmole.modifier >= 0 ? "+" : ""}${ui.rolls.ironmole.modifier} = ${ui.rolls.ironmole.total} vs ${ui.rolls.ironmole.target} (${ui.rolls.ironmole.outcome})` : "",
    ui.bonusScore ? `Optional bonus score: ${ui.bonusScore}` : "",
    notes ? `Table notes: ${notes}` : ""
  ].filter(Boolean).join("\n");
}

async function repairGmOutput(campaign, originalPrompt, badOutput, validation) {
  const settings = settingsForRoute("small");
  const prompt = [
    "Repara esta salida del GM para Totumas & Aventuras.",
    "Devuelve solo JSON valido que cumpla el schema. No cambies reglas, DCs, HP o rituales code-owned.",
    "Conserva la intencion narrativa si es recuperable y agrega actionOptions para ambos heroes si faltan.",
    "",
    "Errores detectados:",
    JSON.stringify(validation.issues || [], null, 2),
    "",
    "Prompt original:",
    originalPrompt,
    "",
    "Salida a reparar:",
    badOutput
  ].join("\n");
  try {
    const result = await callGemini({
      prompt,
      settings,
      apiKey: window.sessionStorage.getItem("tya.gemini.apiKey") || "",
      responseJsonSchema: GM_TURN_SCHEMA,
      systemInstruction: `${buildSystemInstruction(state)}\n\nEres el reparador pequeno del GM. Responde solo JSON valido.`
    });
    const repairedValidation = validateGmOutput(result.text);
    recordLlmRun({ campaign, prompt, result, validation: repairedValidation, settings });
    return { result, validation: repairedValidation };
  } catch (error) {
    recordLlmRun({ campaign, prompt, error, settings });
    return null;
  }
}

async function generateGmDraft(campaign, playerActions) {
  if (!campaign || ui.llmBusy) return;
  state.settings.llmEndpoint = normalizeLlmEndpoint(state.settings.llmEndpoint);
  const settings = settingsForRoute("medium");
  ui.llmBusy = true;
  ui.llmError = "";
  ui.playerActions = playerActions || "";
  ui.promptOutput = buildPromptBundle(state, campaign, ui.playerActions);
  saveState(state);
  render();
  try {
    const result = await callGemini({
      prompt: ui.promptOutput,
      settings,
      apiKey: window.sessionStorage.getItem("tya.gemini.apiKey") || "",
      systemInstruction: buildSystemInstruction(state)
    });
    const validation = validateGmOutput(result.text);
    recordLlmRun({ campaign, prompt: ui.promptOutput, result, validation, settings });
    let finalValidation = validation;
    let finalText = result.text;
    if (!finalValidation.ok) {
      const repaired = await repairGmOutput(campaign, ui.promptOutput, result.text, finalValidation);
      if (repaired?.validation?.ok) {
        finalValidation = repaired.validation;
        finalText = repaired.result.text;
      }
    }
    ui.validation = finalValidation;
    ui.gmOutput = finalText;
    if (!finalValidation.ok) {
      ui.llmError = `The GM response needs repair: ${finalValidation.issues.join(" ")}`;
      return;
    }
    setCurrentTurnDraft(state, campaign, finalValidation, finalText);
    resetTurnInputs();
    ui.llmError = "";
    saveState(state);
    showToast(`Turn ${campaign.currentTurnDraft.turnNumber} is ready`);
  } catch (error) {
    ui.llmError = error.message || "Gemini request failed.";
    recordLlmRun({ campaign, prompt: ui.promptOutput, error, settings });
    showToast("GM could not open the turn");
  } finally {
    ui.llmBusy = false;
    render();
  }
}

async function resolveGameTurn(campaign) {
  if (!campaign?.currentTurnDraft || ui.llmBusy) return;
  const playerActions = collectGameActions();
  if (!playerActions) {
    showToast("Choose actions for Juanete or Ironmole first");
    return;
  }
  const rollGate = getTurnRollGate(campaign);
  if (!rollGate.ok) {
    showToast(rollGate.reason);
    return;
  }
  if (campaign.activeOutGameMission?.status === "required" && !campaign.activeOutGameMission.completed) {
    const checked = document.querySelector("[data-input='ritual-complete']")?.checked || false;
    const proof = document.querySelector("[data-input='ritual-proof']")?.value || ui.ritualProof || "";
    if (!checked) {
      showToast("Complete the required ritual before resolving");
      return;
    }
    completeActiveRitual(campaign, proof || "Ritual checked at the table.");
  }
  if (!ui.selectedActions.juanete && !ui.customActions.juanete && !ui.selectedActions.ironmole && !ui.customActions.ironmole) {
    showToast("Choose at least one action button or custom action");
    return;
  }
  if (campaign.activeEncounter?.enemies?.some((enemy) => enemy.hp > 0)) {
    applyUnresolvedCombatConsequences(campaign);
    campaign.currentTurnDraft.visibleTurnText = [
      campaign.currentTurnDraft.visibleTurnText,
      "",
      "La escena sigue sin resolverse. La amenaza todavia esta en pie; Juanete e Ironmole necesitan otra maniobra antes de que el turno pueda avanzar."
    ].join("\n");
    campaign.mechanicalResults = {
      ...campaign.mechanicalResults,
      unresolved: true,
      d20Rolls: { ...ui.rolls },
      remainingEnemies: campaign.activeEncounter.enemies.map((enemy) => ({ name: enemy.name, hp: enemy.hp, maxHp: enemy.maxHp, condition: enemy.condition }))
    };
    ui.rolls = {};
    saveState(state);
    showToast(`Turn ${campaign.turnNumber}/${campaign.maxTurns} unresolved`);
    render();
    return;
  }
  const draft = campaign.currentTurnDraft;
  campaign.mechanicalResults = {
    ...campaign.mechanicalResults,
    d20Rolls: { ...ui.rolls },
    optionalBonusScore: ui.bonusScore
  };
  const committed = commitTurn(campaign, {
    playerActions,
    visibleTurnText: draft.visibleTurnText,
    gmPayload: draft.gmPayload,
    challengeSignal: draft.challengeSignal,
    stateDeltaProposal: draft.stateDeltaProposal
  });
  if (!committed.ok) {
    showToast(committed.reason);
    return;
  }
  updateCampaignMemory(campaign);
  resetTurnInputs();
  saveState(state);
  await generateGmDraft(campaign, playerActions);
}

function applyUnresolvedCombatConsequences(campaign) {
  const failures = Object.values(ui.rolls).filter((roll) => roll.total < roll.target);
  const livingEnemies = campaign.activeEncounter?.enemies?.filter((enemy) => enemy.hp > 0) || [];
  const damage = Math.max(1, livingEnemies.length + failures.length);
  for (const actor of ["juanete", "ironmole"]) {
    const character = state.characters[actor];
    if (!character) continue;
    const actorFailed = ui.rolls[actor]?.total < ui.rolls[actor]?.target;
    const hpLoss = actorFailed ? damage + 1 : Math.max(1, Math.floor(damage / 2));
    character.hp = Math.max(0, character.hp - hpLoss);
  }
}

function startTimingGame() {
  ui.timing.active = true;
  ui.timing.startedAt = performance.now();
  ui.timing.marker = 0;
  ui.timing.direction = 1;
  animateTimingGame();
  render();
}

function animateTimingGame() {
  window.cancelAnimationFrame(ui.timing.raf);
  const tick = () => {
    if (!ui.timing.active) return;
    ui.timing.marker += ui.timing.direction * 2.4;
    if (ui.timing.marker >= 100) {
      ui.timing.marker = 100;
      ui.timing.direction = -1;
    }
    if (ui.timing.marker <= 0) {
      ui.timing.marker = 0;
      ui.timing.direction = 1;
    }
    const marker = document.querySelector(".timing-marker");
    if (marker) marker.style.setProperty("--marker-x", `${ui.timing.marker}%`);
    ui.timing.raf = window.requestAnimationFrame(tick);
  };
  ui.timing.raf = window.requestAnimationFrame(tick);
}

function strikeTimingGame() {
  const campaign = getActiveCampaign(state);
  const score = scoreFromTimingPercent(ui.timing.marker);
  window.cancelAnimationFrame(ui.timing.raf);
  ui.timing.active = false;
  ui.bonusScore = score;
  registerScore(campaign, score);
  saveState(state);
  showToast(`Score parsed: ${score}`);
}

function updateCampaignMemory(campaign) {
  state.memories["campaigns/active.md"] = [
    `# ${campaign.title}`,
    "",
    `Turn: ${campaign.turnNumber}/${campaign.maxTurns}`,
    `Phase: ${campaign.phase}`,
    "",
    "## Last turns",
    ...campaign.turns.slice(-5).map((turn) => `\n### Turn ${turn.turnNumber}\n\n${turn.visibleTurnText.slice(0, 1200)}`)
  ].join("\n");
}

window.addEventListener("beforeunload", () => {
  if (ui.timing.raf) window.cancelAnimationFrame(ui.timing.raf);
});

document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "s" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    persist("State saved");
  }
});

if (!state || !state.version) {
  state = createInitialState();
  saveState(state);
}

normalizeStoredSettings();
initGlobalUx();
render();
