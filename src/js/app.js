import { createInitialState, getActiveCampaign, getActiveEpicurogotchi, SPHERES, CLASS_NAMES } from "./state.js";
import { loadState, saveState, resetStoredState } from "./storage.js";
import { createCampaign, openEncounter, completeActiveRitual, registerScore, commitTurn, validateGmOutput, setCurrentTurnDraft } from "./campaign.js";
import { buildPromptBundle, bridgecruxFiles } from "./prompts.js";
import { addRitual, deleteRitual, ritualStats } from "./rituals.js";
import { addDiscovery, levelUp, setPetImageFromFile } from "./epicurogotchi.js";
import { exportBundle, importBundle } from "./importExport.js";
import { CLASS_TABLE, modifierFor, scoreFromTimingPercent } from "./rules.js";
import { callGemini, GEMINI_MODEL_TIERS, GEMINI_MODES } from "./llmClient.js";

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
  llmError: "",
  advancedOpen: false,
  selectedActions: {},
  customActions: {},
  ritualComplete: false,
  ritualProof: "",
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

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function resetTurnInputs() {
  ui.selectedActions = {};
  ui.customActions = {};
  ui.ritualComplete = false;
  ui.ritualProof = "";
}

function render() {
  const campaign = getActiveCampaign(state);
  app.innerHTML = `
    <div class="layout">
      ${renderSidebar(campaign)}
      <main class="main">
        ${renderTopbar(campaign)}
        ${renderScreen(campaign)}
      </main>
    </div>
    ${ui.toast ? `<div class="toast">${escapeHtml(ui.toast)}</div>` : ""}
  `;
  bindEvents();
  applyVisualEnhancements();
  if (window.lucide) window.lucide.createIcons();
}

function applyVisualEnhancements() {
  document.documentElement.classList.remove("no-js");
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;
  document.body.classList.toggle("reduced-motion", reducedMotion);
  document.querySelectorAll(".btn").forEach((button) => {
    button.addEventListener("mousemove", (event) => {
      const rect = button.getBoundingClientRect();
      button.style.setProperty("--mouse-x", `${((event.clientX - rect.left) / rect.width) * 100}%`);
      button.style.setProperty("--mouse-y", `${((event.clientY - rect.top) / rect.height) * 100}%`);
    });
    button.addEventListener("mouseleave", () => {
      button.style.setProperty("--mouse-x", "50%");
      button.style.setProperty("--mouse-y", "50%");
    });
  });
}

function initGlobalUx() {
  document.documentElement.classList.remove("no-js");
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.addEventListener("change", (event) => {
    document.body.classList.toggle("reduced-motion", event.matches);
  });
  document.addEventListener("keydown", (event) => {
    if (!event.altKey || event.key < "1" || event.key > "7") return;
    const navButtons = [...document.querySelectorAll(".nav-button")];
    const target = navButtons[Number(event.key) - 1];
    if (!target) return;
    event.preventDefault();
    target.click();
    target.focus();
  });
}

function renderSidebar(campaign) {
  const items = [
    ["dashboard", "layout-dashboard", "Dashboard"],
    ["setup", "scroll", "Campaign Setup"],
    ["play", "swords", "Campaign Play"],
    ["rituals", "flame-kindling", "Rituals Library"],
    ["epicurogotchi", "egg", "Epicurogotchi"],
    ["memory", "folder-open", "Memory / Files"],
    ["bridgecrux", "route", "Bridgecrux"]
  ];
  return `
    <aside class="sidebar">
      <div class="brand-block">
        <span class="brand-kicker">Local-first campaign engine</span>
        <h1 class="brand-title">Totumas & Aventuras</h1>
        <p class="brand-subtitle">${campaign ? escapeHtml(campaign.title) : "No active campaign"} ${campaign ? `- Turn ${campaign.turnNumber}/${campaign.maxTurns}` : ""}</p>
      </div>
      <nav class="nav" aria-label="Primary">
        ${items.map(([view, iconName, label]) => `
          <button class="nav-button ${ui.view === view ? "is-active" : ""}" data-view="${view}">
            ${icon(iconName)} <span>${label}</span>
          </button>
        `).join("")}
      </nav>
      <div class="status-note">
        <strong>Code / LLM border</strong>
        <p class="meta">Code owns state, stats, DCs, rituals, score, memory, and turn gates. The GM writes fiction and proposals.</p>
      </div>
    </aside>
  `;
}

function renderTopbar(campaign) {
  return `
    <div class="topbar">
      <div>
        <span class="eyebrow">Vanaheim session</span>
        <div class="meta">${campaign ? `${escapeHtml(campaign.phase)} - ${escapeHtml(campaign.status)}` : "Create a campaign to open the table."}</div>
      </div>
      <div class="topbar-actions">
        <button class="btn secondary" data-action="export-state">${icon("download")} Export</button>
        <label class="btn secondary">
          ${icon("upload")} Import
          <input data-action="import-state" type="file" accept="application/json" hidden>
        </label>
        <button class="btn ghost" data-action="save-state">${icon("save")} Save</button>
      </div>
    </div>
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

function renderDashboard(campaign) {
  const pet = getActiveEpicurogotchi(state);
  const progress = campaign ? Math.round((campaign.turnNumber / campaign.maxTurns) * 100) : 0;
  return `
    <section class="screen">
      <div class="panel hero-panel">
        <div class="panel-body hero-copy">
          <div>
            <span class="eyebrow">Shared hearth</span>
            <h2 class="screen-title">${campaign ? escapeHtml(campaign.title) : "Open the First Totuma"}</h2>
            <p class="screen-copy">${campaign ? "A fast campaign engine for tactical turns, diegetic out-game missions, and Epicurogotchi growth." : "Create a campaign, choose classes, and let the code prepare a compact GM context."}</p>
          </div>
          <div class="stack">
            <div class="track" aria-label="Campaign progress"><div class="track-fill" style="--track-value:${progress}%"></div></div>
            <div class="metric-strip">
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
      <div class="grid two" style="margin-top: var(--space-5);">
        ${renderActiveMission(campaign)}
        ${renderCharacters()}
      </div>
      <div class="panel" style="margin-top: var(--space-5);">
        <div class="panel-body">
          <div class="split">
            <div>
              <span class="eyebrow">Vanaheim companions</span>
              <h3 class="panel-title">Sphere pressure map</h3>
            </div>
            <button class="btn secondary" data-view="play">${icon("swords")} Open Play</button>
          </div>
          ${renderCompanions()}
        </div>
      </div>
    </section>
  `;
}

function metric(label, value) {
  return `<div class="metric"><span class="stat-label">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderActiveMission(campaign) {
  const mission = campaign?.activeOutGameMission;
  return `
    <div class="panel">
      <div class="panel-body">
        <span class="eyebrow">Out-game mission</span>
        <h3 class="panel-title">${mission ? escapeHtml(mission.ritual.title) : "None active"}</h3>
        ${mission ? `
          <p class="item-copy">${escapeHtml(mission.ritual.description)}</p>
          <div class="pill-row">
            <span class="pill hot">${mission.completed ? "completed" : mission.status}</span>
            <span class="pill">${mission.ritual.size}</span>
            <span class="pill cool">${mission.ritual.sphere}</span>
          </div>
        ` : `<p class="item-copy">Combat encounters will always require a micro or macro ritual before advancement.</p>`}
      </div>
    </div>
  `;
}

function renderCharacters() {
  const pcs = [state.characters.juanete, state.characters.ironmole].filter(Boolean);
  return `
    <div class="panel">
      <div class="panel-body">
        <span class="eyebrow">Player characters</span>
        <h3 class="panel-title">Juanete / Ironmole</h3>
        <div class="card-list" style="margin-top: var(--space-4);">
          ${pcs.length ? pcs.map(renderCharacterCard).join("") : `<div class="empty-state">No classes selected yet.</div>`}
        </div>
      </div>
    </div>
  `;
}

function renderCharacterCard(pc) {
  return `
    <div class="item-card">
      <div class="split">
        <div>
          <h4 class="item-title">${escapeHtml(pc.name)} - ${escapeHtml(pc.className)}</h4>
          <p class="meta">${escapeHtml(pc.resource)} / ${escapeHtml(pc.tendency)}</p>
        </div>
        <span class="pill hot">HP ${pc.hp}/${pc.maxHp}</span>
      </div>
      <div class="stat-grid" style="margin-top: var(--space-3);">
        ${Object.entries(pc.stats).map(([stat, value]) => `
          <div class="stat-box">
            <span class="stat-label">${escapeHtml(stat)}</span>
            <strong>${value}</strong>
            <span class="meta">mod ${modifierFor(value) >= 0 ? "+" : ""}${modifierFor(value)}</span>
          </div>
        `).join("")}
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
            <div class="companion-symbol">${icon(sphere?.icon || "sparkle")}</div>
            <h4 class="item-title">${escapeHtml(companion.name)}</h4>
            <p class="meta">${escapeHtml(companion.sphere)} - Lv ${companion.level}</p>
            <p class="item-copy">${escapeHtml(companion.notes)}</p>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderSetup(campaign) {
  return `
    <section class="screen">
      <div class="screen-header">
        <div>
          <span class="eyebrow">Campaign setup</span>
          <h2 class="screen-title">Forge a Run</h2>
          <p class="screen-copy">The app calculates base stats and act shape. The GM gets a compact context and creates flavor, subclasses, consequences, and Vanaheim pressure.</p>
        </div>
      </div>
      <div class="grid two">
        <form class="panel" data-form="campaign-setup">
          <div class="panel-body form-grid">
            <div class="field full">
              <label for="title">Campaign title</label>
              <input id="title" name="title" value="${escapeHtml(campaign?.title || "The First Totuma")}" maxlength="80">
            </div>
            <div class="field">
              <label for="mode">Campaign type</label>
              <select id="mode" name="mode">${options(["canon", "rogue-crossover", "free-weird-run"], campaign?.mode || "canon")}</select>
            </div>
            <div class="field">
              <label for="maxTurns">Target turns</label>
              <select id="maxTurns" name="maxTurns">${options(["20", "24"], String(campaign?.maxTurns || 20))}</select>
            </div>
            <div class="field">
              <label for="intensity">Combat intensity</label>
              <select id="intensity" name="intensity">${options(["normal", "chaotic", "boss-heavy"], campaign?.intensity || "normal")}</select>
            </div>
            <div class="field">
              <label for="combatWeight">Combat weight</label>
              <input id="combatWeight" name="combatWeight" type="number" min="50" max="95" value="${campaign?.combatWeight || 80}">
            </div>
            <div class="field">
              <label for="juaneteClass">Juanete class</label>
              <select id="juaneteClass" name="juaneteClass">${options(CLASS_NAMES, campaign?.selectedClasses?.juanete || "Bardo")}</select>
            </div>
            <div class="field">
              <label for="ironmoleClass">Ironmole class</label>
              <select id="ironmoleClass" name="ironmoleClass">${options(CLASS_NAMES, campaign?.selectedClasses?.ironmole || "Artificiero")}</select>
            </div>
            <div class="field full">
              <label for="seed">Campaign seed</label>
              <textarea id="seed" name="seed" placeholder="Image, relic, mood, crossover, problem, or desire to test.">${escapeHtml(campaign?.seed || "")}</textarea>
            </div>
            <div class="field full">
              <button class="btn" type="submit">${icon("hammer")} Create / Replace Active Campaign</button>
            </div>
          </div>
        </form>
        <div class="panel">
          <div class="panel-body">
            <span class="eyebrow">Class table</span>
            <h3 class="panel-title">Code-owned stats</h3>
            <div class="card-list" style="margin-top: var(--space-4);">
              ${Object.entries(CLASS_TABLE).slice(0, 8).map(([name, profile]) => `
                <div class="item-card">
                  <h4 class="item-title">${escapeHtml(name)}</h4>
                  <p class="meta">${escapeHtml(profile.resource)} - ${escapeHtml(profile.tendency)}</p>
                  <div class="pill-row">${Object.entries(profile).filter(([key]) => ["Fuerza", "Inteligencia", "Carisma", "Magnetismo"].includes(key)).map(([key, value]) => `<span class="pill">${key} ${value}</span>`).join("")}</div>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderPlay(campaign) {
  if (!campaign) {
    return `
      <section class="screen">
        <div class="empty-state">
          <h2 class="panel-title">No active campaign</h2>
          <p>Create a campaign before opening play.</p>
          <button class="btn" data-view="setup">${icon("scroll")} Campaign Setup</button>
        </div>
      </section>
    `;
  }
  if (campaign.turnNumber === 0) {
    return renderEpicurogotchiPrelude(campaign);
  }
  const currentDraft = campaign.currentTurnDraft || null;
  return `
    <section class="screen">
      <div class="screen-header">
        <div>
          <span class="eyebrow">Campaign play</span>
          <h2 class="screen-title">${escapeHtml(campaign.title)}</h2>
          <p class="screen-copy">Turn ${Math.min(campaign.turnNumber, campaign.maxTurns)}/${campaign.maxTurns}. Read the GM scene, choose what Juanete and Ironmole do, then resolve the turn.</p>
        </div>
      </div>
      <div class="grid two game-table">
        <div class="stack game-main">
          ${renderCurrentScene(campaign, currentDraft)}
          ${renderPlayerTurnPanel(campaign)}
        </div>
        <aside class="stack game-side">
          ${renderGameStatus(campaign)}
          ${renderCombatPanel(campaign)}
          ${renderAdvancedGmPanel(campaign)}
          ${renderTurnLog(campaign)}
        </aside>
      </div>
    </section>
  `;
}

function renderEpicurogotchiPrelude(campaign) {
  return `
    <section class="screen">
      <div class="screen-header">
        <div>
          <span class="eyebrow">Turn 0 / Epicurogotchi sheet</span>
          <h2 class="screen-title">${escapeHtml(campaign.title)}</h2>
          <p class="screen-copy">Before the GM opens Turn 1, the heroes visit the Epicurogotchi sheet to check Piccolo, levels, discoveries, and possible new rituals.</p>
        </div>
      </div>
      <div class="grid two game-table">
        <div class="panel scene-panel">
          <div class="panel-body prelude-body">
            <span class="eyebrow">Zeroth turn</span>
            <h3 class="panel-title">Open Piccolo's Sheet</h3>
            <p class="scene-lead">This is not an LLM step. It is the table ignition before play: review the sheet, note Epicurogotchi level, and bring any discovered rituals back into the campaign.</p>
            <a class="sheet-card" href="${EPICUROGOTCHI_SHEET_URL}" target="_blank" rel="noopener noreferrer">
              <span>${icon("external-link")} Google Sheet</span>
              <strong>Epicurogotchi / Ritual Source</strong>
              <small>Opens the living sheet in Google Drive.</small>
            </a>
            <label class="ritual-check prelude-check">
              <input type="checkbox" data-input="prelude-ready" ${ui.ritualComplete ? "checked" : ""}>
              <span>
                <strong>Piccolo sheet reviewed</strong>
                <small>Level, form, and ritual discoveries are ready for Turn 1.</small>
              </span>
            </label>
            <button class="btn btn-large" data-action="ignite-turn-one" ${ui.ritualComplete || campaign.epicurogotchiReady ? "" : "disabled"}>${icon("flame")} Ignite Turn One</button>
          </div>
        </div>
        <aside class="stack game-side">
          ${renderGameStatus(campaign)}
          <div class="panel">
            <div class="panel-body">
              <span class="eyebrow">What to bring back</span>
              <h3 class="panel-title">Sheet Notes</h3>
              <div class="card-list" style="margin-top: var(--space-4);">
                <div class="item-card"><h4 class="item-title">Epicurogotchi level</h4><p class="meta">Use the sheet as the source of truth for Piccolo before the run.</p></div>
                <div class="item-card"><h4 class="item-title">New rituals</h4><p class="meta">Anything found there can later enter the Ritual Library.</p></div>
                <div class="item-card"><h4 class="item-title">Campaign omen</h4><p class="meta">The first GM scene should react to Piccolo's current state.</p></div>
              </div>
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
      <div class="panel scene-panel">
        <div class="panel-body">
          <span class="eyebrow">GM is opening the table</span>
          <h3 class="panel-title">Piccolo is listening...</h3>
          <p class="item-copy">The campaign is being narrated now. This should only take a moment.</p>
        </div>
      </div>
    `;
  }
  if (!currentDraft) {
    const hasStarted = campaign.turns.length > 0;
    return `
      <div class="panel scene-panel">
        <div class="panel-body">
          <span class="eyebrow">Turn ${campaign.turnNumber}/${campaign.maxTurns}</span>
          <h3 class="panel-title">${hasStarted ? "The Next Scene Is Waiting" : "Begin the Campaign"}</h3>
          <p class="item-copy">${hasStarted ? "The last turn is saved in the log. Generate the next GM scene to keep playing." : "The campaign exists, but the GM has not opened the first scene yet."}</p>
          ${ui.llmError ? `<div class="status-note error">${escapeHtml(ui.llmError)}</div>` : ""}
          <button class="btn" data-action="start-campaign">${icon("sparkles")} ${hasStarted ? `Generate Turn ${campaign.turnNumber}` : "Start Turn One"}</button>
        </div>
      </div>
    `;
  }
  const sections = splitGmScene(currentDraft.visibleTurnText);
  return `
    <article class="panel scene-panel">
      <div class="panel-body">
        <div class="split">
          <div>
            <span class="eyebrow">GM scene</span>
            <h3 class="panel-title">Turn ${currentDraft.turnNumber}/${campaign.maxTurns}</h3>
          </div>
          <span class="pill hot">${escapeHtml(currentDraft.challengeSignal?.challengeType || "scene")}</span>
        </div>
        <div class="scene-scroll">
          ${sections.map((section) => `
            <section class="scene-section ${section.key === "acciones posibles" ? "is-muted" : ""}">
              <span class="scene-section-label">${escapeHtml(section.label)}</span>
              <p>${escapeHtml(section.text)}</p>
            </section>
          `).join("")}
        </div>
      </div>
    </article>
  `;
}

function renderPlayerTurnPanel(campaign) {
  const disabled = !campaign.currentTurnDraft || ui.llmBusy;
  const draft = campaign.currentTurnDraft;
  const options = draft ? getActionOptions(draft) : { juanete: [], ironmole: [] };
  const mission = campaign.activeOutGameMission;
  const ritualRequired = Boolean(mission && mission.status === "required");
  const ritualDone = !ritualRequired || mission.completed || ui.ritualComplete;
  const resolveDisabled = disabled || !ritualDone;
  return `
    <div class="panel">
      <div class="panel-body">
        <span class="eyebrow">Your move</span>
        <h3 class="panel-title">Choose Actions</h3>
        ${mission ? renderRitualGate(mission, disabled) : ""}
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
        ${ui.llmError ? `<div class="status-note error" style="margin-top: var(--space-4);">${escapeHtml(ui.llmError)}</div>` : ""}
        <div class="cluster" style="margin-top: var(--space-4);">
          <button class="btn btn-large" data-action="resolve-game-turn" ${resolveDisabled ? "disabled" : ""}>${icon("sparkles")} ${ui.llmBusy ? "Resolving..." : "Resolve Turn"}</button>
          <button class="btn secondary" data-action="refresh-scene" ${ui.llmBusy ? "disabled" : ""}>${icon("rotate-cw")} Regenerate Scene</button>
        </div>
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
    return [{ key: "scene", label: "GM Scene", text: source || "The GM has not spoken yet." }];
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
      <span class="eyebrow">${escapeHtml(label)}</span>
      ${items.length ? items.map((item) => `
        <button class="action-choice ${selected === item.label ? "is-selected" : ""}" data-action-option="${actor}" data-option-label="${escapeHtml(item.label)}" ${disabled ? "disabled" : ""}>
          <strong>${escapeHtml(item.label)}</strong>
          ${item.stat ? `<small>${escapeHtml(item.stat)}</small>` : ""}
          ${item.intent && item.intent !== item.label ? `<span>${escapeHtml(item.intent)}</span>` : ""}
        </button>
      `).join("") : `<div class="status-note">The GM did not return structured ${escapeHtml(label)} options. Use the custom action field.</div>`}
    </div>
  `;
}

function renderRitualGate(mission, disabled) {
  const ritual = mission.ritual;
  const checked = mission.completed || ui.ritualComplete;
  return `
    <div class="ritual-gate ${checked ? "is-complete" : ""}">
      <div>
        <span class="eyebrow">Required ritual</span>
        <h4>${escapeHtml(ritual.title)}</h4>
        <p>${escapeHtml(ritual.description)}</p>
        <div class="pill-row">
          <span class="pill hot">${escapeHtml(ritual.size)}</span>
          <span class="pill">${escapeHtml(ritual.sphere)}</span>
          <span class="pill cool">${checked ? "complete" : "blocks resolve"}</span>
        </div>
      </div>
      <label class="ritual-check">
        <input type="checkbox" data-input="ritual-complete" ${checked ? "checked" : ""} ${disabled || mission.completed ? "disabled" : ""}>
        <span>Ritual done</span>
      </label>
      <div class="field full">
        <label for="ritualProof">Proof note</label>
        <textarea id="ritualProof" data-input="ritual-proof" placeholder="Short note about the proof at the table." ${disabled || mission.completed ? "disabled" : ""}>${escapeHtml(ui.ritualProof || mission.proofNote || "")}</textarea>
      </div>
    </div>
  `;
}

function renderGameStatus(campaign) {
  const mission = campaign.activeOutGameMission;
  return `
    <div class="panel">
      <div class="panel-body">
        <span class="eyebrow">Game state</span>
        <h3 class="panel-title">${escapeHtml(campaign.phase)}</h3>
        <div class="metric-strip" style="margin-top: var(--space-4);">
          ${metric("Turn", `${campaign.turnNumber}/${campaign.maxTurns}`)}
          ${metric("Ritual", mission ? (mission.completed ? "done" : "open") : "none")}
          ${metric("Combat", campaign.activeEncounter ? "active" : "none")}
          ${metric("GM", ui.llmBusy ? "thinking" : "ready")}
        </div>
      </div>
    </div>
  `;
}

function renderCombatPanel(campaign) {
  const encounter = campaign.activeEncounter;
  const mission = campaign.activeOutGameMission;
  return `
    <div class="panel">
      <div class="panel-body">
        <div class="split">
          <div>
            <span class="eyebrow">Combat panel</span>
            <h3 class="panel-title">${encounter ? escapeHtml(encounter.title) : "No active combat"}</h3>
          </div>
          ${encounter ? `<span class="pill hot">Target ${encounter.target}</span>` : ""}
        </div>
        ${encounter ? `
          <p class="item-copy">${escapeHtml(encounter.objective)}</p>
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
          ${mission ? `
            <div class="status-note warn" style="margin-top: var(--space-4);">
              <strong>${escapeHtml(mission.ritual.title)}</strong>
              <p class="meta">${escapeHtml(mission.ritual.description)}</p>
              <div class="pill-row">
                <span class="pill hot">${mission.completed ? "completed" : "required"}</span>
                <span class="pill">${mission.ritual.size}</span>
                <span class="pill cool">${mission.ritual.sphere}</span>
              </div>
            </div>
            <div class="field" style="margin-top: var(--space-4);">
              <label for="proofNote">Proof note</label>
              <textarea id="proofNote" data-input="proof-note" placeholder="What happened out-game?">${escapeHtml(mission.proofNote || "")}</textarea>
            </div>
            <button class="btn secondary" data-action="complete-ritual" ${mission.completed ? "disabled" : ""}>${icon("badge-check")} Complete Ritual</button>
          ` : ""}
          ${renderTimingGame(encounter)}
        ` : `
          <p class="item-copy">Use this when the GM scene turns into a fight. The code selects the required ritual, target, and score challenge.</p>
          <div class="cluster" style="margin-top: var(--space-4);">
            <button class="btn secondary" data-action="open-skirmish">${icon("swords")} Skirmish</button>
            <button class="btn secondary" data-action="open-boss">${icon("skull")} Boss Gate</button>
          </div>
        `}
      </div>
    </div>
  `;
}

function renderTimingGame(encounter) {
  const score = encounter.minigame?.score;
  return `
    <div class="timing-game" style="margin-top: var(--space-4);">
      <span class="eyebrow">Score challenge</span>
      <div class="timing-track">
        <div class="timing-target"></div>
        <div class="timing-marker" style="--marker-x:${ui.timing.marker}%"></div>
      </div>
      <div class="cluster">
        <button class="btn" data-action="${ui.timing.active ? "strike-score" : "start-score"}">${icon(ui.timing.active ? "crosshair" : "play")} ${ui.timing.active ? "Strike" : "Start"}</button>
        ${score ? `<span class="pill hot">Score ${score}: ${escapeHtml(encounter.minigame.resultLabel)}</span>` : `<span class="meta">Hit the center; the app parses the score.</span>`}
      </div>
    </div>
  `;
}

function renderAdvancedGmPanel(campaign) {
  const sessionKey = window.sessionStorage.getItem("tya.gemini.apiKey") || "";
  return `
    <details class="panel advanced-panel" ${ui.advancedOpen ? "open" : ""}>
      <summary class="advanced-summary">
        <span>${icon("settings")} Advanced GM Settings</span>
        <small>Models, proxy, prompt debugging</small>
      </summary>
      <div class="panel-body">
        <div class="form-grid" style="margin-top: var(--space-4);">
          <div class="field">
            <label for="modelTier">Model route</label>
            <select id="modelTier" data-input="model-tier">
              ${GEMINI_MODEL_TIERS.map((tier) => `<option value="${tier.value}" ${state.settings.modelTier === tier.value ? "selected" : ""}>${tier.label}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="llmMode">API mode</label>
            <select id="llmMode" data-input="llm-mode">
              ${GEMINI_MODES.map((mode) => `<option value="${mode.value}" ${state.settings.llmMode === mode.value ? "selected" : ""}>${mode.label}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="thinkingLevel">Thinking</label>
            <select id="thinkingLevel" data-input="thinking-level">${options(["minimal", "low", "medium", "high"], state.settings.thinkingLevel || "high")}</select>
          </div>
          <div class="field">
            <label for="maxOutputTokens">Max output</label>
            <input id="maxOutputTokens" data-input="max-output-tokens" type="number" min="500" max="30000" value="${state.settings.maxOutputTokens || 20000}">
          </div>
          <div class="field">
            <label for="thinkingBudget">2.5 thinking budget</label>
            <input id="thinkingBudget" data-input="thinking-budget" type="number" min="128" max="32768" value="${state.settings.thinkingBudget || 16000}">
          </div>
          <div class="field">
            <label for="temperature">Temperature</label>
            <input id="temperature" data-input="temperature" type="number" min="0" max="2" step="0.01" value="${state.settings.temperature || 0.85}">
          </div>
          <div class="field full">
            <label for="llmEndpoint">Proxy endpoint</label>
            <input id="llmEndpoint" data-input="llm-endpoint" value="${escapeHtml(state.settings.llmEndpoint || "")}" placeholder="Optional Netlify function or local endpoint">
          </div>
          <div class="field full">
            <label for="geminiApiKey">Gemini API key</label>
            <input id="geminiApiKey" data-input="gemini-api-key" type="password" value="${escapeHtml(sessionKey)}" autocomplete="off" placeholder="Session only; not exported">
          </div>
        </div>
        <div class="field" style="margin-top: var(--space-4);">
          <label for="playerActions">Juanete / Ironmole actions</label>
          <textarea id="playerActions" data-input="player-actions" placeholder="What do they do?">${escapeHtml(ui.playerActions)}</textarea>
        </div>
        <div class="cluster">
          <button class="btn" data-action="build-prompt">${icon("copy")} Build Prompt</button>
          <button class="btn secondary" data-action="copy-prompt" ${ui.promptOutput ? "" : "disabled"}>${icon("clipboard")} Copy</button>
          <button class="btn secondary" data-action="use-local-proxy">${icon("server")} Local Proxy</button>
          <button class="btn" data-action="run-gemini" ${ui.llmBusy ? "disabled" : ""}>${icon("wand-sparkles")} ${ui.llmBusy ? "Running..." : "Run Gemini"}</button>
        </div>
        ${ui.llmError ? `<div class="status-note error" style="margin-top: var(--space-4);">${escapeHtml(ui.llmError)}</div>` : ""}
        ${ui.promptOutput ? `<pre class="prompt-output" style="margin-top: var(--space-4);">${escapeHtml(ui.promptOutput)}</pre>` : ""}
      </div>
    </details>
  `;
}

function renderGmPanel(campaign) {
  const gate = campaign ? "" : "disabled";
  return `
    <div class="panel">
      <div class="panel-body">
        <span class="eyebrow">GM output</span>
        <h3 class="panel-title">Validate and commit</h3>
        <div class="field" style="margin-top: var(--space-4);">
          <label for="gmOutput">Paste GM JSON or visible text</label>
          <textarea id="gmOutput" data-input="gm-output" placeholder='{"visibleTurnText":"...","challengeSignal":{...}}'>${escapeHtml(ui.gmOutput)}</textarea>
        </div>
        <div class="cluster">
          <button class="btn secondary" data-action="validate-gm" ${gate}>${icon("scan-text")} Validate</button>
          <button class="btn" data-action="commit-turn" ${gate}>${icon("check")} Commit Turn</button>
        </div>
        ${ui.validation ? renderValidation(ui.validation) : ""}
      </div>
    </div>
  `;
}

function renderValidation(validation) {
  return `
    <div class="status-note ${validation.ok ? "" : "error"}" style="margin-top: var(--space-4);">
      <strong>${validation.ok ? "Output passes current validation." : "Repair needed."}</strong>
      ${validation.issues.length ? `<ul>${validation.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>` : ""}
    </div>
  `;
}

function renderTurnLog(campaign) {
  return `
    <div class="panel">
      <div class="panel-body">
        <span class="eyebrow">Turn log</span>
        <h3 class="panel-title">Saved turns</h3>
        <div class="log-list" style="margin-top: var(--space-4);">
          ${campaign.turns.length ? campaign.turns.slice().reverse().map((turn) => `
            <article class="turn-log">
              <span class="eyebrow">Turn ${turn.turnNumber}</span>
              <pre>${escapeHtml(turn.visibleTurnText || "No visible text.")}</pre>
            </article>
          `).join("") : `<div class="empty-state">No turns committed yet.</div>`}
        </div>
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
          <span class="eyebrow">Rituals library</span>
          <h2 class="screen-title">Out-game Fuel</h2>
          <p class="screen-copy">Every combat pulls from these pools. If no matching ritual exists, the app falls back to a Joker ritual request.</p>
        </div>
      </div>
      <div class="metric-strip" style="margin-bottom: var(--space-5);">
        ${metric("Total", stats.total)}
        ${metric("Micro", stats.micro)}
        ${metric("Macro", stats.macro)}
        ${metric("Spheres", SPHERES.length)}
      </div>
      <div class="grid two">
        <form class="panel" data-form="ritual">
          <div class="panel-body form-grid">
            <div class="field full"><label>Title</label><input name="title" required></div>
            <div class="field full"><label>Description</label><textarea name="description" required></textarea></div>
            <div class="field"><label>Sphere</label><select name="sphere">${SPHERES.map((sphere) => `<option value="${sphere.id}">${sphere.name}</option>`).join("")}</select></div>
            <div class="field"><label>Size</label><select name="size">${options(["micro", "macro"], "micro")}</select></div>
            <div class="field"><label>Difficulty</label><select name="difficulty">${options(["easy", "normal", "hard", "boss", "mythic"], "normal")}</select></div>
            <div class="field"><label>Duration</label><input name="duration" placeholder="5-10 min"></div>
            <div class="field"><label>Tone</label><input name="tone" placeholder="focused"></div>
            <div class="field"><label>Reward bias</label><input name="rewardBias" placeholder="resonance"></div>
            <div class="field full"><label>Tags</label><input name="tags" placeholder="food, precision, idea"></div>
            <div class="field full"><label><input type="checkbox" name="requiresProof" checked> Requires proof note</label></div>
            <div class="field full"><button class="btn" type="submit">${icon("plus")} Add Ritual</button></div>
          </div>
        </form>
        <div class="panel">
          <div class="panel-body">
            <span class="eyebrow">Pool</span>
            <h3 class="panel-title">Editable rituals</h3>
            <div class="card-list" style="margin-top: var(--space-4);">
              ${state.ritualPools.map((ritual) => `
                <div class="item-card">
                  <div class="split">
                    <div>
                      <h4 class="item-title">${escapeHtml(ritual.title)}</h4>
                      <p class="meta">${escapeHtml(ritual.duration)} - ${escapeHtml(ritual.tone)}</p>
                    </div>
                    <button class="icon-button" title="Delete ritual" data-action="delete-ritual" data-id="${ritual.id}">${icon("trash-2")}</button>
                  </div>
                  <p class="item-copy">${escapeHtml(ritual.description)}</p>
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
          <span class="eyebrow">Epicurogotchi sheet</span>
          <h2 class="screen-title">${escapeHtml(pet.name)}</h2>
          <p class="screen-copy">One shared pet for Juanete and Ironmole. Discoveries become ritual material and campaign memory.</p>
        </div>
      </div>
      <div class="grid two">
        <div class="panel">
          <div class="panel-body">
            <div class="hero-art" style="min-height: 420px; border: 0;"><img src="${escapeHtml(pet.image)}" alt="${escapeHtml(pet.name)}"></div>
            <div class="metric-strip" style="margin-top: var(--space-4);">
              ${metric("Level", pet.level)}
              ${metric("Form", pet.form)}
              ${metric("Findings", pet.discoveries.length)}
              ${metric("History", pet.formHistory.length)}
            </div>
            <div class="cluster" style="margin-top: var(--space-4);">
              <button class="btn" data-action="level-pet">${icon("arrow-up")} Level Up</button>
              <label class="btn secondary">${icon("image-up")} Image <input data-action="pet-image" type="file" accept="image/*" hidden></label>
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-body">
            <span class="eyebrow">Enjuanetados</span>
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
                  <p class="meta">${escapeHtml(item.sphere)} - ${escapeHtml(item.ritualSize)}</p>
                  <p class="item-copy">${escapeHtml(item.note)}</p>
                  <button class="btn secondary" data-action="discovery-to-ritual" data-id="${item.id}">${icon("flame-kindling")} Convert to Ritual</button>
                </div>
              `).join("") : `<div class="empty-state">No discoveries yet.</div>`}
            </div>
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
          <span class="eyebrow">Memory / files</span>
          <h2 class="screen-title">Virtual Workspace</h2>
          <p class="screen-copy">Markdown lives in browser storage and exports with the campaign bundle.</p>
        </div>
      </div>
      <div class="panel">
        <div class="panel-body file-browser">
          <div class="file-list">
            ${fileNames.map((file) => `<button class="file-tab ${file === ui.currentFile ? "is-active" : ""}" data-file="${escapeHtml(file)}">${escapeHtml(file)}</button>`).join("")}
            <button class="btn secondary" data-action="new-file">${icon("file-plus")} New File</button>
          </div>
          <div class="stack">
            <div class="field">
              <label>${escapeHtml(ui.currentFile)}</label>
              <textarea data-input="memory-file" style="min-height: 540px;">${escapeHtml(selected)}</textarea>
            </div>
            <div class="cluster">
              <button class="btn" data-action="save-file">${icon("save")} Save File</button>
              <button class="btn secondary" data-action="delete-file">${icon("trash-2")} Delete File</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderBridgecrux() {
  return `
    <section class="screen">
      <div class="screen-header">
        <div>
          <span class="eyebrow">Bridgecrux / LLM OS</span>
          <h2 class="screen-title">Prompt Spine</h2>
          <p class="screen-copy">These are the local task contracts used by prompt assembly. They are also mirrored in the memory workspace.</p>
        </div>
      </div>
      <div class="grid two">
        ${Object.entries(bridgecruxFiles).map(([name, content]) => `
          <div class="panel">
            <div class="panel-body">
              <span class="eyebrow">${escapeHtml(name)}</span>
              <pre class="codebox" style="margin-top: var(--space-3);">${escapeHtml(content)}</pre>
            </div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
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
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const campaign = createCampaign(state, data);
    state.settings.llmEndpoint = state.settings.llmEndpoint || "http://127.0.0.1:8787/api/gemini";
    resetTurnInputs();
    saveState(state);
    ui.view = "play";
    showToast("Campaign forged. Open Piccolo's sheet first.");
  });

  document.querySelector("[data-action='open-skirmish']")?.addEventListener("click", () => {
    const campaign = getActiveCampaign(state);
    openEncounter(state, campaign, { scale: "skirmish" });
    saveState(state);
    showToast("Skirmish opened with required ritual");
  });

  document.querySelector("[data-action='open-boss']")?.addEventListener("click", () => {
    const campaign = getActiveCampaign(state);
    openEncounter(state, campaign, { scale: "boss", difficultyBand: "boss" });
    saveState(state);
    showToast("Boss gate opened with macro ritual");
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
    await generateGmDraft(campaign, "Regenerate the current GM scene. Keep the same campaign state, but make the scene more directly playable.");
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
      ui.selectedActions[button.dataset.actionOption] = button.dataset.optionLabel || "";
      render();
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
  });

  document.querySelector("[data-input='ironmole-action']")?.addEventListener("input", (event) => {
    ui.customActions.ironmole = event.currentTarget.value;
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
    state.settings.llmEndpoint = "http://127.0.0.1:8787/api/gemini";
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
        apiKey: window.sessionStorage.getItem("tya.gemini.apiKey") || ""
      });
      ui.gmOutput = result.text;
      ui.validation = validateGmOutput(result.text);
      if (ui.validation.ok) {
        setCurrentTurnDraft(campaign, ui.validation, result.text);
        resetTurnInputs();
        saveState(state);
      }
      ui.llmError = "";
      showToast(`Gemini returned ${result.model}`);
    } catch (error) {
      ui.llmError = error.message || "Gemini request failed.";
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
  state.settings.llmEndpoint = document.querySelector("[data-input='llm-endpoint']")?.value?.trim() || "";
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
    notes ? `Table notes: ${notes}` : ""
  ].filter(Boolean).join("\n");
}

async function generateGmDraft(campaign, playerActions) {
  if (!campaign || ui.llmBusy) return;
  state.settings.llmEndpoint = state.settings.llmEndpoint || "http://127.0.0.1:8787/api/gemini";
  ui.llmBusy = true;
  ui.llmError = "";
  ui.playerActions = playerActions || "";
  ui.promptOutput = buildPromptBundle(state, campaign, ui.playerActions);
  saveState(state);
  render();
  try {
    const result = await callGemini({
      prompt: ui.promptOutput,
      settings: state.settings,
      apiKey: window.sessionStorage.getItem("tya.gemini.apiKey") || ""
    });
    const validation = validateGmOutput(result.text);
    ui.validation = validation;
    ui.gmOutput = result.text;
    if (!validation.ok) {
      ui.llmError = `The GM response needs repair: ${validation.issues.join(" ")}`;
      return;
    }
    setCurrentTurnDraft(campaign, validation, result.text);
    resetTurnInputs();
    ui.llmError = "";
    saveState(state);
    showToast(`Turn ${campaign.currentTurnDraft.turnNumber} is ready`);
  } catch (error) {
    ui.llmError = error.message || "Gemini request failed.";
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
  const draft = campaign.currentTurnDraft;
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

initGlobalUx();
render();
