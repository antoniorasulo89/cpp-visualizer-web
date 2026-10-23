---
name: Dentro il codice — web demo
description: Selectable workbench skins for observing algorithms in the browser.
colors:
  paper: "oklch(97% 0.008 260)"
  panel: "oklch(100% 0 0)"
  ink: "oklch(27% 0.045 260)"
  muted: "oklch(44% 0.035 260)"
  rule: "oklch(84% 0.025 260)"
  accent: "oklch(45% 0.19 262)"
  on-accent: "oklch(100% 0 0)"
  selected: "oklch(93% 0.04 260)"
  canvas: "oklch(99% 0.005 260)"
  focus: "oklch(43% 0.19 262)"
  error: "oklch(42% 0.16 20)"
  success: "oklch(37% 0.09 165)"
  success-paper: "oklch(93% 0.04 165)"
  error-paper: "oklch(94% 0.035 20)"
  mappa-paper: "oklch(95% 0.026 255)"
  mappa-canvas: "oklch(97% 0.02 255)"
  mappa-accent: "oklch(44% 0.2 260)"
  segnali-paper: "oklch(96% 0.008 90)"
  segnali-ink: "oklch(23% 0.015 250)"
  segnali-muted: "oklch(41% 0.015 250)"
  segnali-accent: "oklch(27% 0.02 250)"
  segnali-selected: "oklch(89% 0.16 95)"
  segnali-rule: "oklch(78% 0.014 90)"
  classica-paper: "oklch(97% 0.007 160)"
  classica-ink: "oklch(29% 0.025 170)"
  classica-muted: "oklch(43% 0.025 170)"
  classica-rule: "oklch(82% 0.025 170)"
  classica-accent: "oklch(39% 0.075 170)"
  classica-selected: "oklch(92% 0.035 160)"
typography:
  headline:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: "clamp(1.25rem, 2.2vw, 1.75rem)"
    fontWeight: 700
    letterSpacing: "-0.025em"
  title:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: "1.125rem"
    fontWeight: 700
  label:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 600
  code-editor:
    fontFamily: 'Consolas, "Liberation Mono", monospace'
    fontSize: "15px"
    lineHeight: 1.65
  code-output:
    fontFamily: 'Consolas, "Liberation Mono", monospace'
    fontSize: "14px"
    lineHeight: 1.65
  value:
    fontFamily: 'Consolas, "Liberation Mono", monospace'
    fontSize: "24px"
rounded:
  field: "4px"
  control: "5px"
  panel: "6px"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.75rem"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.75rem"
  button-secondary-hover:
    backgroundColor: "{colors.selected}"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "1rem"
  skin-choice:
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.75rem"
  code-field:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "16px"
  observation:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "0.75rem"
---

# Design System: Dentro il codice — web demo

## Overview

**Creative North Star: "The Selectable Workbench"**

This system describes only `app/c++_visualizer/wasm-demo`, including its shared interactive flowchart. It does not govern other applications in this repository. The workbench keeps program editing and observed execution together for guided lessons and individual study. Four user-selectable skins express the same operational interface: Laboratorio, Mappa, Segnali and Classica. The earlier direction images are references, not exact reproduction specifications.

Light, flat panels, compact controls and code-first typography support concentrated work. Settings changes presentation immediately while preserving the editor, input, diagram and compiled trace. No photographic or illustrative picture requirement is shipped; the flowchart is an interactive SVG generated from runtime data.

**Key Characteristics:**
- Four selectable presentations with one shared engine and data model.
- Flat, bordered work surfaces and restrained state color.
- Platform sans for operations; monospace for source and values.
- Responsive workspace with an internally scrollable flowchart.

## Colors

The frontmatter records the default Laboratorio palette and only the overrides actually shipped for each additional skin. A prefixed token replaces its matching unprefixed role when that skin is selected; unlisted roles inherit the default.

### Primary

- **Cobalt accent:** default commands, selected borders, links and active diagram strokes; Mappa deepens the blue and applies it to diagram routes.
- **Ink accent:** Segnali uses dark commands, a dark header and yellow selected-state surfaces.
- **Green accent:** Classica uses muted green commands and corresponding green-gray surfaces.

### Neutral

- **Paper / panel / canvas:** outer workspace, white work surfaces, and code or diagram areas.
- **Ink / muted / rule:** primary text, supporting text, and structural borders.
- **On accent:** white command text.
- **Selected:** active instructions, changed values, selected mode and selected skin.

### Named Rules

**The Shared State Rule.** Skin colors change presentation; true/false branches keep their shared success/error semantics across skins.

Error and success colors and their pale surfaces communicate diagnostics and branch outcomes. Focus retains the shared cobalt role across all skins.

## Typography

**Interface Font:** Segoe UI with system-ui and sans-serif fallbacks.
**Code/Value Font:** Consolas with Liberation Mono and monospace fallbacks.

The inherited platform sans is an intentional operational constraint, including the compact product title. There is no separate display or marketing typeface. Default body sizing follows the browser; the interface does not impose a new global body size.

### Hierarchy

- **Headline:** compact responsive product name with tight tracking.
- **Title:** section headings; subordinate headings inherit the base stylesheet's 14px scale.
- **Label:** 14px command text at weight 600; ordinary field labels and hints retain the compact 13px base scale.
- **Code editor / output:** distinct 15px and 14px monospace scales, both with generous 1.65 leading.
- **Value:** 24px monospace numbers with tabular numeral alignment.
- **Flowchart:** 13px node text and 11px edge annotations.

**The Operational Type Rule.** Keep interface language in the platform sans and program syntax, observed values and editable expressions in monospace.

## Layout

Header and main share a centered container capped at 1920px, with medium vertical and large horizontal padding. The desktop workspace uses a 1.9:1 editor/execution split with a minimum 290px execution column; Classica uses equal columns. Medium gaps and panel padding form the main rhythm. Smaller inherited flowchart controls retain their compact local spacing.

Desktop commands stick to the viewport top. The execution panel sticks below them at 112px, with its own vertical scrolling and a viewport-relative height cap. Laboratorio places tools beside the canvas in a 190px-minimum tool column; at 1100px and below it returns to a vertical flow. Skin choices use four columns, two at 1100px and below, and one at 414px and below.

At 850px and below, all skins stack the workspace; commands and execution become normal document flow, container padding contracts, and the canvas minimum height reduces from 360px to 280px. The flowchart retains internal overflow and a 65dvh height cap. At 540px and below, inherited field grids become one column. At 414px and below, panel padding contracts again. The code editor is vertically resizable, normally 52dvh with a 420px minimum, reduced to a 340px minimum on narrow screens.

## Elevation & Depth

The shipped system uses no box shadows. Borders and paper/panel/canvas tones separate areas; selected fills and stronger diagram strokes communicate state. Sticky surfaces use opaque paper rather than blur. Skin-choice color and border transitions last 120ms with ease-out only when reduced motion is not requested.

Upstream 442f8ff adds native Popover API block menus and FOR tooltips. In the web demo these inherit skin tokens and use borders without shadows. Multiline block fields have a 5.5rem minimum rather than the source editor height. The playback group uses the same compact controls; speed is a labeled native select. PNG export resolves computed skin colors from the actual SVG.

**The Flat Workbench Rule.** Preserve the existing tonal surfaces and one-pixel structural borders when extending this demo.

## Shapes

Small practical curves distinguish fields and observations, controls, and larger panels through the three recorded radius steps. Borders are primarily one pixel. Diagram semantics keep their own SVG geometry: rounded terminals, rectangular operations and polygon decisions/input-output. Selection uses a dashed outline; the running node uses a stronger solid stroke. These geometries carry meaning and remain consistent across skins.

## Components

### Buttons

Compact, text-led commands use a 40px minimum height, control rounding and a one-pixel rule border. The compile action uses accent/on-accent colors and retains that treatment on hover. Secondary commands gain a selected-tone hover fill. Pressed mode buttons also gain an accent border. Disabled commands use 0.45 opacity and a default cursor.

### Inputs / Fields

Textareas use canvas surfaces, field rounding, one-pixel rules and monospace text. Diagram input and select controls have a 36px minimum height. Native radio inputs use the active accent, an 18px square footprint and a visible checked state. Shared focus-visible treatment is a 3px cobalt outline with a 3px offset; inherited SVG node focus uses its own stronger stroke rather than the rectangular control outline.

### Cards / Containers

Editor and execution panels use white panel surfaces, panel rounding and a rule border. Settings and the quick guide use control rounding, compact padding and normal document flow. Skin-choice labels are whole clickable rows containing native radios, a strong name and supporting description. Hover and checked states share a selected fill and accent border.

### Navigation

Mode controls expose pressed state. Execution navigation places previous and next actions around the step label, followed by a full-width native range input. Controls wrap with available space. Settings is opened from the header; opening focuses the currently checked skin radio. Native radio keyboard behavior remains available.

### Observation and diagram

The event strip, active source line and changed-value cells share the selected tone. Segnali strengthens the event message to 16px bold. Cells wrap and use tabular monospace values. SVG nodes retain live editing, selected, active and branch-result states; Mappa colors ordinary routes blue while branch truth retains success/error styling.

Selecting a skin updates the root data attribute without replacing the controls. The browser saves a valid preference per demo path; unavailable storage produces a session-only status message. Invalid stored preferences fall back to Laboratorio.

## Do's and Don'ts

### Do:
- **Do** preserve code, input, diagram and compiled trace when changing presentation.
- **Do** use the existing semantic color roles and the selected skin's overrides.
- **Do** keep native controls, visible keyboard focus and state announcements.
- **Do** keep runtime diagram geometry interactive and scroll it within its canvas.

### Don't:
- **Don't** apply this demo's design system to unrelated applications without a separate decision.
- **Don't** treat direction mockups as shipped raster assets or claim exact image reproduction.
- **Don't** introduce a display identity font into this intentionally operational platform interface.
- **Don't** encode branch truth using only a skin's accent color.
