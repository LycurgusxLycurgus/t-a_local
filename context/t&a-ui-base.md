---
version: alpha
name: Totumas & Aventuras (The Shared Hearth)
description: A design system for high-stakes intimate roleplaying. It balances the epic scale of high fantasy with the tactile intimacy of a two-person bond.
colors:
  primary: "#0A0908"
  secondary: "#1A1816"
  tertiary: "#E36414"
  neutral: "#F2E9E4"
  accent-gold: "#9A8C73"
  resonance-red: "#5F0F40"
  error: "#9E2A2B"
typography:
  headline-display:
    fontFamily: Cinzel
    fontSize: 48px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: 0.05em
  headline-lg:
    fontFamily: Cinzel
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.2
  body-md:
    fontFamily: Lora
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: Lora
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0.15em
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 48px
  xl: 80px
  gutter: 24px
rounded:
  none: 0px
  sm: 2px
  md: 4px
  lg: 8px
elevation:
  artifact: "0 10px 30px rgba(0,0,0,0.8)"
  inner-glow: "inset 0 0 15px rgba(227, 100, 20, 0.1)"
components:
  button-resolve:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.primary}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.sm}"
    padding: 16px
  button-resolve-hover:
    backgroundColor: "#FB8B24"
  card-totuma:
    backgroundColor: "{colors.secondary}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
---

# Totumas & Aventuras Design System

## Overview

**Totumas & Aventuras** is built on the metaphor of the **Shared Hearth**. Unlike traditional RPG systems that feel like spreadsheets, this system prioritizes the "Artifact" feel—the sense that the digital interface is a physical object placed between two people.

The brand personality is **Epic Intimacy**. It uses the visual language of ancient myths (heavy serifs, forged metals, dark shadows) to elevate the private conversations and relationship-building tasks of the players. It should feel high-stakes, exciting, and deeply grounded.

## Colors

The palette mimics a campfire in the wilderness. High-contrast darkness provides the "Abyss," while the "Ember" provides the focal point for action.

- **Primary (#0A0908):** "The Abyss." Used for the global background to create a sense of focused immersion.
- **Secondary (#1A1816):** "The Totuma." Used for containers and cards. It represents the dried gourd or vessel holding the shared content.
- **Tertiary (#E36414):** "The Ember." Used for primary actions, calls to movement, and highlights. It represents the energy of the bond.
- **Neutral (#F2E9E4):** "The Parchment." Used for all primary body text to ensure high legibility against the dark background.
- **Accent Gold (#9A8C73):** Used for metadata, borders, and decorative flourishes that signify "Epic" quality.

## Typography

The system uses a "Mythic-Technical" split. Narrative elements use serifs; functional elements use sans-serifs.

- **Headlines (Cinzel):** Used for epic context—locations, quest titles, and milestones. It evokes the feeling of stone inscriptions.
- **Body (Lora):** Used for the story and character interaction. Its calligraphic serifs feel like a personal letter or a journal entry.
- **Labels (Inter):** Used for technical data, stats, and navigation. It provides modern precision to ensure the "game" remains playable.

## Layout

The layout follows a **Symmetrical Convergence** model. 

- **The Shared Table:** Content is centered to imply that both players are looking at the same artifact simultaneously.
- **The Totuma Container:** Elements are rarely "loose" on the screen. They are contained within cards (Totumas) with internal padding of 24px (`md`) to create a sense of protection and shared space.
- **Guttering:** A strict 24px gutter maintains a "prestige" feel, avoiding the cluttered density of traditional productivity apps.

## Elevation & Depth

Depth is used to simulate weight and physical presence.

- **Base Layer:** The Abyss (#0A0908) is the furthest plane.
- **Artifact Layer:** Cards and containers utilize a heavy shadow (`elevation.artifact`) to appear as if they are resting on a leather or stone surface.
- **The Glow:** Interactive elements do not just change color; they emit an `inner-glow` to simulate the heat of a burning ember.

## Shapes

The shape language is **Forged.** 

- We avoid the "bubbly" aesthetic of modern social apps. 
- All corners use a minimal **4px radius** (`rounded.md`). This mimics hand-cut stone or weathered wood—slightly softened by use, but fundamentally rigid and strong.

## Components

### Buttons (Resolves)
Buttons are referred to as "Resolves." They represent a choice made by the pair.
- **Primary:** Ember background with Abyss text. On hover, it glows brighter.
- **Secondary:** Transparent with an Accent Gold border. Used for non-critical choices.

### Cards (Totumas)
The central container for all information.
- Every Totuma card has a top-border "accent line" (1px) in Tertiary to signify it is active.
- Padding is generous (24px) to allow the content to "breathe" within the vessel.

### Relationship Track
A unique component for this system. It is a thin horizontal bar that fills with the Tertiary color. It should always have a subtle outer glow to represent the "Resonance" between players.

## Do's and Don'ts

- **Do** use `Cinzel` only for titles and short, epic phrases.
- **Don't** use pure white (#FFFFFF). Always use `Neutral` (#F2E9E4) to avoid "digital glare" and maintain the parchment feel.
- **Do** treat every screen as a physical table. Imagine if the UI could be touched.
- **Don't** use standard "Material Design" shadows. Use the heavy, dark shadows defined in the Elevation section.
- **Do** ensure that every primary action feels "Epic"—even a "Save Settings" button should feel like sealing a scroll.