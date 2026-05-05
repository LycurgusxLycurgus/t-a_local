---
version: alpha
name: Totumas & Aventuras Forged Hearth
description: A physical tabletop and action-RPG cockpit design system for a local-first Vanaheim campaign engine.
colors:
  abyss-950: "#050504"
  abyss-900: "#0A0908"
  abyss-800: "#13110F"
  abyss-700: "#1A1816"
  abyss-600: "#24211E"
  abyss-500: "#2D2A27"
  ember-500: "#E36414"
  ember-300: "#FB8B24"
  ember-100: "#FFC971"
  blood-700: "#7A1B1B"
  gold-500: "#857861"
  gold-400: "#9A8C73"
  gold-300: "#C2B59B"
  parchment-100: "#F2E9E4"
  parchment-300: "#D6CCC6"
  parchment-400: "#B5ABA5"
  parchment-500: "#9A8C73"
  success-500: "#76946A"
  bridgecrux: "#FF3366"
typography:
  display-epic:
    fontFamily: Cinzel
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: 0.1em
  title-epic:
    fontFamily: Cinzel
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: 0.1em
  body-lore:
    fontFamily: Lora
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.8
    letterSpacing: 0em
  body-ui:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0em
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: 0.2em
  code-debug:
    fontFamily: Fira Code
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0em
rounded:
  none: 0px
  forged: 2px
  smooth: 4px
spacing:
  micro: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 32px
  xl: 48px
  xxl: 64px
  max-screen: 1400px
components:
  plate:
    backgroundColor: "{colors.abyss-700}"
    textColor: "{colors.parchment-100}"
    borderColor: "{colors.abyss-500}"
    rounded: "{rounded.forged}"
    padding: "{spacing.md}"
  plate-active:
    backgroundColor: "{colors.abyss-700}"
    borderColor: "{colors.ember-500}"
    rounded: "{rounded.forged}"
    padding: "{spacing.md}"
  button-primary:
    backgroundColor: "{colors.ember-500}"
    textColor: "{colors.abyss-900}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.forged}"
    padding: 12px 24px
  button-secondary:
    backgroundColor: "{colors.abyss-900}"
    textColor: "{colors.gold-400}"
    borderColor: "{colors.gold-400}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.forged}"
    padding: 12px 24px
  nav-link:
    textColor: "{colors.parchment-400}"
    activeColor: "{colors.ember-500}"
    typography: "{typography.label-caps}"
  input:
    backgroundColor: "{colors.abyss-900}"
    textColor: "{colors.parchment-100}"
    borderColor: "{colors.abyss-500}"
    focusColor: "{colors.ember-500}"
    typography: "{typography.body-ui}"
    rounded: "{rounded.forged}"
  debug-panel:
    backgroundColor: "{colors.abyss-950}"
    textColor: "{colors.parchment-300}"
    borderColor: "{colors.bridgecrux}"
    typography: "{typography.code-debug}"
---

# Totumas & Aventuras Design

## Overview

The interface is a forged shared hearth: a local-first campaign table that feels physical, heavy, and ritualized while still behaving like an action-RPG cockpit during play. It should feel like players are opening an object on a dark table, not operating a SaaS dashboard or chatting with a model.

The emotional target is intimate pressure. Campaign setup feels like forging a run. Campaign play feels tactical, stateful, and immediate. Bridgecrux feels like a separate engine room where machine-facing details belong. Epicurogotchi is a visible companion artifact and should remain a memorable focal presence when relevant.

Every primary screen should move toward a unified artifact surface: one coherent physical game object with internal zones, hinges, rails, bays, drawers, command bands, and cockpit-like state surfaces. Avoid generic two-column page layouts, detached card stacks, and cards nested inside cards unless the screen is explicitly a library or debug surface. The app should feel assembled from purposeful instruments, not scattered panels.

The UI must keep the game in front and the machinery behind it. Model routes, prompts, JSON, validation language, and internal repair details belong only in debug/developer surfaces.

## Colors

The palette is the campfire against the void: abyss surfaces, ember action, ancient gold metadata, parchment text, and blood danger.

- **Abyss (#0A0908):** The table surface and deepest page background. It carries the physical leather texture and should dominate the product atmosphere.
- **Forged Plate (#1A1816):** Main panels, cards, vessels, and cockpit surfaces. Use it for contained game objects.
- **Ember (#E36414):** Primary action, active navigation, turn pressure, focus heat, and high-intent interface states.
- **Bright Ember (#FB8B24):** Hover, active feedback, critical highlights, and moments that need heat without becoming red danger.
- **Ancient Gold (#9A8C73):** Labels, trim, secondary buttons, borders, metadata, and ritual-object affordances.
- **Parchment (#F2E9E4):** Primary readable text, headings, narration, and hero names.
- **Blood (#7A1B1B):** Enemy intent, damage, failure, and dangerous unresolved combat states.
- **Bridgecrux Pink (#FF3366):** Debug-only accent. It should visually separate engine/debug surfaces from the player-facing game.

Do not introduce purple gradients, blue neon dashboards, pastel fantasy colors, glassmorphism, or bright SaaS neutrals.

## Typography

Typography is split by role.

- **Cinzel:** Epic titles, screen names, panel headings, campaign names, hero names, enemy names, and buttons. It gives the app its mythic carved quality.
- **Lora:** Narration, lore text, campaign prose, ritual descriptions, and anything meant to be read as story.
- **Inter:** Compact mechanics, labels, stats, metadata, forms, navigation, and short operational text.
- **Fira Code:** Bridgecrux, JSON, prompts, raw logs, model configuration, and other developer/debug content.

Labels are uppercase with generous tracking. Narration should keep normal letter spacing and generous line height. Do not use oversized hero typography inside dense cockpit panels or compact controls.

## Layout

The layout behaves like plates on a table.

Global navigation is horizontal, compact, and persistent. Screens use a constrained maximum width around 1400px, with strong vertical spacing and panels that feel like physical objects resting on a dark textured surface.

Campaign Play is the exception: it becomes a cockpit. It should prioritize hero state, the scene or enemy arena, active ritual/mission, action choices, dice, and consequences. In combat, enemies and choices should visually dominate more than long prose. In exploration, narration may breathe more, but players should still know what each hero can do next.

Use grid layouts for repeated state blocks and flex layouts for command clusters, but compose full pages as unified artifact surfaces whenever possible. Content must scroll when it exceeds the viewport. Never trap the app in a fixed-height composition that hides lower content.

## Elevation & Depth

Depth is physical, not glossy.

Panels use near-black surfaces, faint gold-brown borders, top-edge heat, inset shadows, and restrained ember glow. Use heavy shadows to suggest object weight and recessed shadows for cockpit/arena surfaces. Glow belongs to active actions, focus states, dice, and high-pressure feedback.

Avoid floating glass cards, blurred translucent panels, bright drop shadows, and soft bubbly depth. Surfaces should feel forged, worn, and contained.

## Shapes

The shape language is forged, not molded.

Use sharp or nearly sharp corners: 0px, 2px, and 4px. Buttons, inputs, cards, dice, cockpit plates, and chips should share this angular discipline. Do not use large rounded pills, bubbly cards, full-rounded buttons, or mixed radius styles within the same view.

The physical die control is diamond-like and tactile. Ritual boxes may use dashed borders to evoke proof, pact, or artifact handling.

## Components

**Navigation:** Compact, uppercase, icon-supported where possible, and clearly active. Bridgecrux uses the debug accent and should feel separate from the normal game.

**Plates and panels:** Main containers use forged plate backgrounds with subtle borders, tight radii, and heavy shadows. Active panels can receive an ember top edge or faint inner heat.

**Buttons:** Primary buttons are ember-filled and reserved for the most important action in the current surface. Secondary buttons use gold outlines. Danger buttons use blood. Disabled states must be visibly inert.

**Inputs:** Inputs use abyss backgrounds, parchment text, forged borders, and ember focus. Forms should feel like controls on an artifact, not like generic browser forms.

**Forge Console:** Campaign setup should be one unified artifact surface, not a two-column form plus reference table. Use an engraved control band, two hero forge bays, horizontal class rails, a ritual drawer, and a seed/action footer so setup feels like preparing a run inside the same physical object. Class changes must update the visible hero stats immediately, even when an active campaign already exists.

**Hero cards:** Show HP, class, stats, chosen action, and current state. Juanete and Ironmole should be visually distinct without splitting the palette into unrelated themes.

**Enemy cards:** Use blood and ember pressure. Always show enemy HP, intent, objective, and target when combat exists.

**Ritual gates:** Use dashed gold borders, ritual language, and a clear completion checkbox. A required ritual must block action submission until complete.

**Dice and rolls:** Dice are core interaction, not decoration. The d20/check roll and damage/effect roll should be clear, tactile, and connected to the selected hero action.

**Logs:** Battle and consequence logs are compact, readable, and chronological. They should not dominate the main scene.

**Bridgecrux:** Use code typography, stark contrast, debug accent, and raw technical language. This is the only place where prompts, model configuration, JSON, repairs, and fallback reasons should be visible.

## Do's and Don'ts

- Do make the app feel like a physical tabletop artifact with a game engine behind it.
- Do make each primary screen feel like one unified object with internal zones rather than a collection of unrelated cards.
- Do keep the current turn, phase, hero state, ritual gate, and next action obvious.
- Do preserve readable long-form narration with Lora and generous line height.
- Do use ember for primary actions and high-pressure focus.
- Do keep Epicurogotchi visually present as an artifact or companion sheet when relevant.
- Do keep Bridgecrux visually and linguistically separate from player screens.
- Do verify scrolling, dynamic content, and mobile collapse after frontend changes.
- Don't expose LLM/model/prompt language in normal gameplay screens.
- Don't make the interface look like a chat app, SaaS admin, generic fantasy dashboard, or blue neon control room.
- Don't use purple gradients, glassmorphism, rounded pill systems, or generic card grids.
- Don't let combat become only text; it must expose choices, rolls, HP, enemy intent, and consequences.
- Don't let generated content overflow, overlap, or hide controls.
