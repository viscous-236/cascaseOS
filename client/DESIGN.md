---
name: CascadeOS
description: A delivery ledger connecting milestone schedules, payment evidence, and release decisions.
colors:
  canvas: "#f3f4f5"
  surface: "#ffffff"
  surface-raised: "#f6f7f8"
  surface-hover: "#eceef0"
  text: "#202326"
  text-soft: "#535b63"
  text-muted: "#626a72"
  line: "#e3e6e8"
  line-strong: "#b9c0c6"
  primary: "#24282c"
  on-primary: "#ffffff"
  blue: "#1d5fbf"
  blue-soft: "#edf3fc"
  green: "#28704e"
  green-soft: "#ecf5ef"
  amber: "#8b5b16"
  amber-soft: "#fbf4e7"
  red: "#b43f43"
  red-soft: "#fbeef0"
  overlay: "rgb(18 22 26 / 42%)"
  dark-canvas: "#18191b"
  dark-surface: "#202224"
  dark-surface-raised: "#25282a"
  dark-surface-hover: "#303436"
  dark-text: "#f0f1f2"
  dark-text-soft: "#b9bfc3"
  dark-text-muted: "#a1a9ae"
  dark-line: "#34383b"
  dark-line-strong: "#626a70"
  dark-primary: "#e8ebed"
  dark-on-primary: "#202326"
  dark-blue: "#8fb9f8"
  dark-blue-soft: "#252f3d"
  dark-green: "#9acbb0"
  dark-green-soft: "#26382e"
  dark-amber: "#e5be7c"
  dark-amber-soft: "#3b3426"
  dark-red: "#f1a1a5"
  dark-red-soft: "#3c2b2e"
  dark-overlay: "rgb(0 0 0 / 60%)"
typography:
  headline:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "clamp(22px, 2.1vw, 30px)"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-.035em"
  title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "-.02em"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.5
  summary:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-.04em"
  summary-lead:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-.04em"
rounded:
  radius: "8px"
  control-radius: "6px"
  dialog: "12px"
  tag: "4px"
  track: "2px"
  drawer: "0px"
spacing:
  gap-4: "4px"
  gap-6: "6px"
  gap-8: "8px"
  gap-10: "10px"
  gap-12: "12px"
  inset-16: "16px"
  inset-20: "20px"
  panel-22: "22px"
  gutter-24: "24px"
  gutter-32: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.control}"
    rounded: "{rounded.control-radius}"
    padding: "8px 13px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.control}"
    rounded: "{rounded.control-radius}"
    padding: "8px 13px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.text}"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.text-soft}"
    typography: "{typography.control}"
    rounded: "{rounded.control-radius}"
    width: "36px"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.text-soft}"
    padding: "7px 0"
  button-text-hover:
    textColor: "{colors.blue}"
  input-phase:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control-radius}"
    padding: "7px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.text-soft}"
    rounded: "{rounded.control-radius}"
    padding: "9px 12px"
  nav-item-active:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.text}"
    typography: "{typography.control}"
  quiet-tag:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-soft}"
    typography: "{typography.label}"
    rounded: "{rounded.tag}"
    padding: "4px 8px"
  status-danger:
    textColor: "{colors.red}"
    typography: "{typography.label}"
  recovery-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.radius}"
    padding: "22px"
  release-chain:
    textColor: "{colors.text}"
    typography: "{typography.label}"
    padding: "0"
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.dialog}"
---

# Design System: CascadeOS

## Overview

**Creative North Star: "Delivery ledger"**

Drawing-register clarity defines the chosen world: cool paper, graphite text, ink controls, blue schedule marks, and restrained state signals. Compact Geist typography, aligned figures, and flat sheets keep milestone readiness and financial evidence readable together.

The primary workspaces use an open-plane shell and purposeful registers rather than nested decorative cards. Existing dialogs and embedded tools are brought into this world through compatibility styles and theme bridges; their retained utility markup is not the template for new workspace components.

**Key Characteristics:**
- Light-first surfaces with a persistent dark appearance.
- Labelled navigation, compact controls, and fluid workspace gutters.
- Tabular financial evidence and explicit status wording.
- Flat panels with restrained borders; elevation reserved for overlays.
- A three-part release chain for invoice, materials, and predecessors.

This is an extraction of implemented work, not a new direction. Paths below are relative to `client/`. Token authority is `src/index.css`; intent is recorded in `design-direction.md`, with product constraints in `PRODUCT.md`. The scoped ship verdict in `.impeccable/review/verdict.md` covers three resolved findings only, not a whole-product certification.

## Colors

The palette is achromatic-led, with color carrying schedule, selection, and state information.

### Primary
- **Graphite ink** (`primary`, `on-primary`): principal actions and ready release-chain nodes. Dark appearance reverses the contrast relationship rather than keeping black buttons.
- **Schedule blue** (`blue`, `blue-soft`): active schedule marks, selected rows, links on hover, caret, and keyboard focus. The soft pair is selection fill, not a second primary action color.

### Semantic state colors
- **Readiness green** (`green`, `green-soft`): completed, paid, allowed, executed, and approved statuses.
- **Review amber** (`amber`, `amber-soft`): ready to release, partially paid, requires approval, and proposed. Ready to release is amber, not completed green.
- **Blocker red** (`red`, `red-soft`): payment blocked, overdue, block, and blocked; the soft fill also supports connection errors.
- **Informational blue**: rerouted active and materials ordered. Other statuses, including scheduled and awaiting predecessor, use muted neutral text.

### Neutral
- **Cool paper** (`canvas`): application ground and sidebar.
- **Sheet** (`surface`): registers, panels, fields, and dialogs.
- **Raised paper / hover plane** (`surface-raised`, `surface-hover`): quiet tags, compatibility surfaces, navigation hover, and segmented-control ground.
- **Graphite text hierarchy** (`text`, `text-soft`, `text-muted`): primary facts, supporting labels, and annotations.
- **Rules** (`line`, `line-strong`): sheet dividers and stronger field or track boundaries.
- **Scrim** (`overlay`): modal and folded-navigation backdrop.

Unprefixed YAML color names mirror `:root` custom properties. Each `dark-` entry records the same property's override in `:root.dark`; these are documentation names, not additional runtime CSS variables. Component references describe light mode; runtime `var(--…)` bindings select the current theme. `src/context/CascadeStateContext.tsx` defaults to light and persists `cascade_theme` in local storage.

**The State Has Words Rule.** Pair semantic color with a visible state label; a colored dot or track is not the only explanation.

`src/components/workspace/Status.tsx` owns the status mapping. Schedule tracks and Bryntum bars deliberately use muted neutral for completed work, red for payment blocks, and stronger neutral for scheduled/dependency-blocked work; their mapping is not identical to status-label color. The sidecar's synthesized tonal ramps are panel visualization aids only, not shipped CSS tokens or additional palette choices.

## Typography

**Display and body font:** Geist, with system-ui and sans-serif fallbacks. There is no separate display face. Four self-hosted TrueType files in `public/fonts/` provide regular, medium, semibold, and bold (400/500/600/700), registered with `font-display: swap` in `src/index.css`. Font licensing and provenance live beside them in `public/fonts/OFL.txt` and `public/fonts/README.md`.

**Character:** Compact, readable, and matter-of-fact. Sentence-case labels, restrained medium-weight headings, and aligned numerals carry hierarchy rather than ornamental typography.

### Hierarchy
- **Headline:** Project title; the frontmatter's fluid desktop role becomes fixed at 28px at the navigation fold and 24px on mobile. Maximum desktop title width is 760px.
- **Title:** Section headings; recovery-rail titles use a separate local treatment (18px, 500, 1.35 line height, -.025em tracking; 20px on mobile).
- **Body:** Global base; many workspace descriptions and table cells are compact (13px). Rail descriptions use 1.65 line height. Evidence descriptions have a 65ch maximum width.
- **Label:** Standard status and supporting labels. Desktop table annotations use 11px; milestone names use 14px medium. Mobile phase crews and status labels grow to 12px.
- **Control:** Primary and secondary button labels. Text actions are 12px medium.
- **Summary / summary lead:** Undivided financial summary values. Both become 24px on mobile; the leading value retains semibold weight.

**The Tabular Evidence Rule.** Use Geist tabular numerals for money and align numeric table columns to the right; do not substitute a decorative mono face.

The body applies `font-variant-numeric: tabular-nums`; numeric cells repeat it explicitly. `src/utils/formatters.ts` formats integer minor-unit values as USD with two decimals. Missing quote facts are labelled at their call sites; typography must not imply verified amounts. `tailwind.config.js` maps both sans and mono utilities to Geist. Dialog hash strings using the break-all compatibility selector retain a local system-monospace treatment.

## Layout

`src/App.tsx` supplies the shared shell; `src/components/workspace/Sidebar.tsx` supplies project selection and labelled destinations. The desktop sidebar is fixed (224px), with a matching workspace offset. Workspace gutters are symmetric (32px), with a 1920px maximum workspace width. The root supports widths from 320px.

The overview places an undivided four-column summary above a fluid milestone register and fixed recovery rail (300px) separated by 24px. Recovery uses the same two-column proportions. This is the implemented sizing, rather than a universal 2:1 grid. Panels commonly use 22px insets; mobile panels use 20px. Spacing frontmatter records recurring observed values, not an enforced arithmetic scale.

| Breakpoint | Implemented behavior |
| --- | --- |
| At least 1700px | Overview/recovery rail becomes 340px; milestone cells gain 20px vertical padding. |
| At most 1190px | Overview and recovery stack into one column; overview readiness rail becomes a two-column inner layout. The attention link appears when blocked phases exist. |
| At most 1000px | Desktop navigation folds into a 260px overlay drawer; 62px mobile header appears. Workspace offset clears and gutters become 24px. |
| At most 640px | Gutters become 16px; summary becomes two columns; register rows become compact grids; readiness rail stacks; toolbars wrap; dialog layouts become single-column. |

Desktop milestone cells resolve to 8px vertical and 14px horizontal padding after the density overrides. On mobile each register row has 16px by 12px outer padding and a three-column grid (fluid / 100px / 30px); name, actions, schedule, and invoice remain readable without the desktop header row. Supplier comparisons retain an 820px minimum table width inside a horizontal scroller; policy tables use 500px. Do not collapse their financial columns into unreadable widths.

At the mobile breakpoint, Bryntum's chart is replaced by a milestone list. Chart-only Critical Path, timeframe, and Zoom controls are hidden; Add Phase and milestone inspection remain. AG Studio retains an embedded scrollable canvas rather than a custom mobile chart redesign. Sources: `src/components/TimelinePane.tsx`, `src/studio/StudioWorkspace.tsx`, and the media queries in `src/index.css`.

## Elevation & Depth

Primary workspace surfaces are flat: tonal separation and fine borders establish hierarchy. No gradients or decorative panel shadows belong to this system. Overlays are the explicit depth exception: the dialog shadow is `0 20px 80px rgb(0 0 0 / 18%)`, paired with the theme's scrim. Drawers use square edges. Do not infer a general elevation scale from legacy Tailwind shadow definitions or retained third-party controls.

**The Flat Sheet Rule.** Use surface tone and borders for workspace hierarchy; reserve elevation for overlays.

The compatibility layer removes small/medium shadows inside dialogs and flattens topology overlay panels. The AG Studio toolbar retains utility styling, including its selected edit/preview control shadow; that is a compatibility detail, not a new canonical panel treatment. `tailwind.config.js` still contains older FinOps colors, animation definitions, and card shadows; these are not the primary workspace token authority.

## Shapes

Panels, table wrappers, timeline, and studio shell use gently curved corners (`radius`). Buttons and fields use the tighter `control-radius`; dialogs use `dialog`. These map to the shipped 8px / 6px / 12px hierarchy. Drawers are square. Quiet tags and segmented-control buttons use the smaller `tag` radius; schedule tracks use `track`.

Borders are generally one pixel: ordinary sheet boundaries use `line`, while controls use `line-strong`. Status dots and release-chain nodes are circular; pill-shaped containers are not the primary control language. The three stepped bars in the CascadeOS brand are inline SVG from `src/components/workspace/Sidebar.tsx`; workspace icons use restrained Lucide strokes, with navigation icons at 18px and stroke width 1.7.

## Components

### Buttons
Compact, labelled, and direct. Primary actions use ink and its contrasting foreground; secondary actions use a sheet background and stronger border. Shared padding is recorded in frontmatter. Both have a 36px minimum height, increasing to 44px on mobile. Primary hover reduces opacity to .9; secondary and icon hover use the hover plane. Pressing primary, secondary, or icon controls scales them to .97. Disabled buttons use .55 opacity and a not-allowed cursor.

Icon buttons are 36px wide; mobile increases their minimum height but retains their width. Text actions are unfilled, with blue hover text and 40px mobile minimum height. Sources: `src/index.css`, `src/components/workspace/DeliveryOverview.tsx`, and `src/App.tsx`.

### Inputs / Fields
Phase-composer fields use the surface/strong-border/control-corner treatment, 7px padding, and 36px minimum height. Native workspace selects use 38px minimum height and 8px 32px 8px 12px padding. Search is deliberately quieter: transparent, borderless on desktop overview, with an underline in supplier and mobile contexts. All fields keep a blue caret, muted placeholder, and standard visible focus.

### Navigation and filters
Labelled navigation links use 40px minimum height and 9px 12px padding. The current page has hover-plane fill, primary text, medium weight, and `aria-current="page"`. Folded navigation uses the existing dialog focus behavior. Segmented filters have a hover-plane outer track, surface-filled selected item, and `aria-pressed`; recovery evidence tabs use an underline rather than filled cards. Sources: `src/components/workspace/Sidebar.tsx`, `src/components/workspace/DeliveryOverview.tsx`, and `src/components/FinOpsWidgetPanel.tsx`.

### Tags and status
Quiet tags are neutral annotations with 4px 8px padding. Status labels are colored text with a 5px decorative dot and readable wording, not filled badges. The separate environment indicator uses a 6px dot. The selected milestone row uses soft blue. Sources: `src/components/workspace/Status.tsx` and `src/components/workspace/SupplierWorkspace.tsx`.

### Registers and decision panels
Registers use full-width collapsed tables, fine row rules, muted headings, and right-aligned financial values. A sheet boundary contains the data without nested card chrome. Recovery and proposal panels carry 22px padding and no shadow. The overview selection changes its readiness rail; the recovery workspace explicitly distinguishes selected-milestone evidence from the named project proposal. Preserve those labels and scopes. Sources: `src/components/workspace/DeliveryOverview.tsx`, `src/components/workspace/DependencyWorkspace.tsx`, and `src/components/FinOpsWidgetPanel.tsx`.

### Release chain
The signature readiness pattern is an ordered three-part chain: **Invoice / Materials / Predecessors**. The durable direction calls this the invoice/materials/work release chain; the implemented third label is Predecessors. Nodes are 17px circles joined by a one-pixel rule. Ready nodes use ink fill and a check; pending nodes use a neutral inner dot. Each node retains a plain-language value. Payment alone must not visually imply material or predecessor readiness. Source: `ReleaseChain` in `src/components/workspace/DeliveryOverview.tsx`.

### Dialog compatibility and embedded themes
Existing approval, new-project, chat, audit, and task-financial workflows retain their component structure. The shared compatibility selectors in `src/index.css` normalize surfaces, semantic colors, neutral text, corners, labels, and control sizes. Dialog fields use a 40px minimum height; on mobile inputs become 16px and buttons 44px minimum height. Dialog headers use 20px medium titles (18px mobile). This is a bridge for existing dialogs, not a replacement primitive API. Sources: `src/components/ApprovalCheckoutModal.tsx`, `src/components/NewProjectModal.tsx`, `src/components/AgentChatModal.tsx`, `src/components/AuditDrawer.tsx`, and `src/components/TaskFinancialsDrawer.tsx`.

Bryntum imports its Stockholm light base, then receives CSS-variable overrides for both themes, typography, selected rows, schedule bars, and dependencies. AG Studio receives explicit light/dark values through `studioTheme.withParams` in `src/studio/StudioWorkspace.tsx`; it sets Geist, sheet/canvas/text/border roles, toggle states, and the first chart series to schedule blue. Custom studio widgets and the optional 3D topology view have scoped compatibility selectors in `src/index.css`. These bridges do not imply that every third-party palette or control was rebuilt.

### Focus and motion
The standard visible focus is a 2px blue outline with 3px offset on interactive controls. Programmatically focused dialog containers suppress their own outline; descendant controls retain it. `src/components/ui/useDialog.ts` contains focus containment, Escape dismissal, background isolation, scroll locking, and focus restoration. The skip link in `src/App.tsx` focuses the current workspace without changing its route.

Button color transitions use 140ms ease; press transforms use 140ms with the custom easing curve. Folded navigation uses 220ms with that curve. Refresh spin is .8s linear. Reduced-motion CSS changes animation and transition durations to .001ms, animation iteration count to one, and scroll behavior to auto. `MotionConfig reducedMotion="user"` also wraps the app. Full values are carried in the sidecar extensions, not unsupported YAML groups.

## Do's and Don'ts

### Do:
- **Do** use the light/dark CSS-variable pairs from `src/index.css` for new workspace surfaces.
- **Do** keep financial columns right-aligned with Geist tabular numerals.
- **Do** pair state color with readable labels and keep invoice, materials, and predecessors distinct.
- **Do** preserve the navigation fold, mobile register layout, visible focus, and reduced-motion behavior.
- **Do** keep selected-milestone evidence visibly separate from the named recovery proposal.

### Don't:
- **Don't** add gradients or decorative workspace shadows; reserve depth for overlays.
- **Don't** promote legacy dialog utilities, FinOps palette entries, or third-party defaults into primary workspace tokens.
- **Don't** make pending approval look like completed payment or release readiness.
- **Don't** invent financial values, progress percentages, savings totals, or verification claims to fill the interface.
- **Don't** show chart-only controls when the mobile schedule chart is hidden.
