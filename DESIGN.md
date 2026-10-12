---
name: Podcast Radar
description: A YouTube-style light dashboard for a founder's weekly booking, topic and sponsor decisions, with a YouTube-dark toggle.
colors:
  page: "#f9f9f9"
  surface: "#ffffff"
  surface-2: "#f2f2f2"
  ink: "#0f0f0f"
  ink-2: "#4d4d4d"
  ink-3: "#606060"
  line: "#ececec"
  line-strong: "#d9d9d9"
  bar-empty: "#e5e5e5"
  accent: "#d91f26"
  accent-ink: "#ffffff"
  accent-soft: "#fdeced"
  accent-soft-ink: "#b3131a"
  info: "#1a5fd6"
  info-soft: "#e8effd"
  good: "#11804a"
  good-soft: "#e5f5ec"
  warn: "#965400"
  warn-soft: "#fdf1dc"
  bad: "#c0262d"
  bad-soft: "#fdecec"
  violet: "#6d3fd8"
  violet-soft: "#efe9fd"
typography:
  display:
    fontFamily: "Roboto, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: "2rem"
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Roboto, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: "1.75rem"
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Roboto, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: "1.5rem"
  stat:
    fontFamily: "Roboto, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "tnum"
  body-lead:
    fontFamily: "Roboto, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.625
  body:
    fontFamily: "Roboto, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  body-strong:
    fontFamily: "Roboto, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.25rem"
  label:
    fontFamily: "Roboto, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1rem"
  meta:
    fontFamily: "Roboto, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1rem"
    fontFeature: "tnum"
  guide-label:
    fontFamily: "Roboto, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.65rem"
    fontWeight: 400
    lineHeight: "1rem"
rounded:
  row: "8px"
  card: "12px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  card: "20px"
  xl: "24px"
  section: "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.line-strong}"
  button-ghost:
    textColor: "{colors.ink-2}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "32px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
  input-pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "40px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  rank-row:
    rounded: "{rounded.row}"
    padding: "10px 12px"
  rank-row-hover:
    backgroundColor: "{colors.surface-2}"
  pill-neutral:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  pill-high:
    backgroundColor: "{colors.good-soft}"
    textColor: "{colors.good}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  pill-medium:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  nav-item:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.row}"
    height: "40px"
  nav-item-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-soft-ink}"
  chip-nav:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.row}"
    padding: "6px 12px"
  chip-nav-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.page}"
  avatar-initials:
    backgroundColor: "{colors.violet-soft}"
    textColor: "{colors.violet}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.pill}"
    size: "40px"
  stat-icon-circle:
    backgroundColor: "{colors.info-soft}"
    textColor: "{colors.info}"
    rounded: "{rounded.pill}"
    size: "48px"
---

# Design System: Podcast Radar

## Overview

**Creative North Star: "The Founder's Studio Home"**

Podcast Radar borrows YouTube Studio's home screen so a channel founder reads it on Monday morning without learning anything. The page is near-white, the cards are white with hairline edges, the type is Roboto in three weights, and one red marks where the brand is and what to press. Everything else carries meaning through soft tints: violet, green, blue, amber and a pale red, each a background wash with its deeper ink on top.

Density is moderate and list-led. The week arrives as four stat tiles, then three ranked lists side by side, each row two lines at most: a name with its context and pill, then one line of reason. Real data is the visual material: YouTube thumbnails fetched at runtime, initials avatars instead of faces, channel dots that always carry their channel's name. A YouTube-dark theme sits behind the header toggle and keeps the same structure, swapping shadows for stepped greys.

**Key Characteristics:**
- YouTube-familiar chrome: sticky 56px header with logo, centered pill search and theme toggle; icon sidebar that folds into a 72px mini-guide.
- One red, five tints: a solid red fill appears in very few places; meaning is carried by soft tinted circles and pills.
- Pill-shaped controls, 12px hairline cards, 8px rows and thumbnails.
- Roboto only, at 400, 500 and 700, with tabular numerals wherever numbers are compared.
- Real data only: runtime YouTube thumbnails, initials avatars, named channel dots.

## Colors

A neutral YouTube grey scale carrying one brand red and a family of five soft tints, mirrored for dark mode.

### Primary
- **Studio Red** (accent): the logo mark, the page's single primary button, and the active navigation indicator (the active sidebar icon and the active tab underline). In dark mode it lifts to #e3343a.
- **Red Wash / Red Wash Ink** (accent-soft, accent-soft-ink): the active sidebar item's background and label, and the red member of the tint family (topic rank badge 1, one avatar tint, accent pills). Also the text-selection colour.

### Secondary
- **Link Blue** (info, info-soft): every text link ("View all", "Outreach drafts", "TextLink"), the focus ring, the focused input border, and this week's bar in the topic rows. Its wash fills the blue tint circle.

### Tertiary
- **Signal Green** (good, good-soft): "High" pills, upward deltas, "New", "Emailed".
- **Amber** (warn, warn-soft): "Medium" pills and low-confidence warnings.
- **Alarm Red** (bad, bad-soft): downward deltas, errors and failed states. It is a status colour, distinct from Studio Red.
- **Violet** (violet, violet-soft): the user's own avatar, the "New episodes" tile, brief question bullets, and a tint in the avatar rotation.

### Neutral
- **Page** (page): the app background; #0f0f0f in dark.
- **Surface / Surface 2** (surface, surface-2): cards and header; surface-2 is the hover fill for rows, nav and ghost buttons, the secondary button fill and the neutral pill. Dark: #1c1c1c and #272727.
- **Ink / Ink 2 / Ink 3** (ink, ink-2, ink-3): headings and names; supporting text and icons; metadata, descriptions and placeholders.
- **Hairline / Strong Hairline** (line, line-strong): card borders and row dividers; input and search borders and the secondary button hover.
- **Empty Bar** (bar-empty): the unfilled track of topic bars.

### Named Rules
**The One Red Rule.** Solid Studio Red is reserved for the logo mark, the single primary action on a page, and the active navigation indicator. Nothing else is filled or written in solid red; links are blue, and status errors use Alarm Red.

**The Five Tints Rule.** Meaning that is not an action uses a tint pair: a soft wash with its deeper ink (violet, good, info, warn, accent-soft). Icons sit in these as circles; pills and avatars draw from the same five.

**The Mirror Rule.** Every colour token has a dark counterpart under `data-theme="dark"`; components reference tokens, never literal colours, so the toggle restyles everything at once.

## Typography

**Display Font:** Roboto (with ui-sans-serif, system-ui, sans-serif)
**Body Font:** Roboto
**Label/Mono Font:** Roboto, with tabular numerals (`.num`) for figures

**Character:** Plain, familiar and dense, the way YouTube's own UI reads. Hierarchy comes from weight (400, 500, 700) and ink step, not from size jumps or second families.

### Hierarchy
- **Display** (700, 1.5rem, tight -0.015em): the page title or greeting; one per page.
- **Headline** (700, 1.125rem, -0.01em): section titles ("Your channels").
- **Title** (700, 1rem): card titles ("Top guest opportunities", "Weekly brief").
- **Stat** (700, 1.75rem, line-height 1, tabular): the big number on a stat tile.
- **Body lead** (400, 0.95rem, relaxed): the description line under a page title.
- **Body / Body strong** (400 / 500, 0.875rem): row text; names, button labels and nav items take 500.
- **Label** (500, 0.75rem): pills and inline emphasis inside metadata.
- **Meta** (400, 0.75rem, tabular): counts, dates, "vs last week", card footnotes.
- **Guide label** (400, 0.65rem): labels under icons in the mini-guide only.

### Named Rules
**The One Family Rule.** Roboto is the only family, loaded at 400, 500 and 700. Use only those three weights.

**The Tabular Figures Rule.** Any number that is compared with another (stats, deltas, views, dates, durations) uses tabular numerals.

## Layout

The shell is a sticky 56px header over a two-column grid: sidebar plus a main column capped at 1440px, padded 16 / 24 / 32px by breakpoint. Below 768px the sidebar is hidden and the nav becomes a horizontally scrolling chip row inside the header. From 768px to 1535px the sidebar is a 72px mini-guide (icon over a small label); from 1536px it widens to 232px with icon-and-label rows and a provenance footnote.

The Overview stacks: greeting row with the primary action on the right; stat tiles 2-up, then 4-up from 1024px; three ranked cards 1-up, then 3-up from 1024px; a 320px right rail that sits beside the content from 1400px (87.5rem) and below that drops into a 1/2/3-column row directly under the ranked lists. Grid gaps are 12px between cards and 24px between bands; sections open with 40px above them; cards pad 20px horizontally.

**The Two-Line Row Rule.** A ranked row is at most two lines: line one is the name, its context and a pill; line two is one reason or detail, clamped. Rows hold a 72px minimum height so columns align.

**The Mini-Guide Rule.** Navigation never disappears on tablet and laptop widths; it collapses to the 72px icon guide, and becomes the chip row only on phones.

## Elevation & Depth

Flat and tonal. In light mode cards carry a whisper shadow (two 1-3px blurs at 3-4% ink) on top of the hairline border, just enough to lift white off the near-white page. In dark mode the shadow token is `none` and depth comes from surface steps (#0f0f0f page, #1c1c1c card, #272727 hover). The header is the one translucent layer: surface at 85-95% with backdrop blur. Hover never lifts; it fills with surface-2.

### Shadow Vocabulary
- **Card whisper** (`--shadow`: `0 1px 2px rgb(15 15 15 / 0.04), 0 1px 3px rgb(15 15 15 / 0.03)`; `none` in dark): every Panel.

**The Hairline-First Rule.** Edges are drawn by a 1px hairline, not by shadow; the shadow is optional seasoning that disappears in dark.

## Shapes

Three radii. Fully rounded pills for buttons, inputs, the search bar, status pills, avatars and icon circles. A 12px card radius with a 1px hairline for every container. An 8px radius for things inside cards: hoverable rows, nav items, thumbnails, brand avatars and the mobile nav chips. Duration badges on thumbnails are the only small (4px) radius. Empty states use the card radius with a dashed strong hairline.

**The Pill Rule.** Every button and text field is pill-shaped. A rectangular button is off-system.

**The Hairline Card Rule.** Containers are white (or #1c1c1c in dark) with a 12px radius and a 1px hairline border; dividers inside them are the same hairline.

## Components

### Buttons
- **Shape:** fully rounded pill, 36px tall, 16px side padding, 500 weight label with an optional 16px leading icon.
- **Primary:** Studio Red fill, white label. One per page (the greeting's "Write & email weekly brief", a detail page's main research action). Hover darkens by brightness (95%), active 90%; disabled drops to 60% opacity. Pending shows a spinning loader and a progress label.
- **Secondary:** surface-2 fill with ink label; hover fills with the strong hairline grey.
- **Ghost:** 32px, no fill, ink-2 label; hover fills surface-2 and darkens to ink (row actions like "Remove").
- **Icon button:** 36px circle, ink-2 icon, surface-2 hover (theme toggle, search submit).

### Pills
- **Style:** full radius, 2px by 8px, 0.75rem at 500, a tint pair from the Five Tints family; an optional 6px current-colour dot.
- **Ranking pills:** "High" is green, "Medium" is amber, each with a title explaining the threshold.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** surface.
- **Shadow Strategy:** the card whisper in light, none in dark.
- **Border:** 1px hairline; footnotes sit below a hairline divider in meta type.
- **Internal Padding:** 20px horizontal, 16px top for the title row; list bodies inset 8px so 8px-radius rows hover inside the card.

### Inputs / Fields
- **Style:** 40px pill, 1px strong hairline border, surface fill, ink-3 placeholder, optional 16px search icon inset at 12px.
- **Focus:** the border turns Link Blue; the global focus ring is a 2px blue outline offset 2px.

### Navigation
- **Sidebar:** 40px rows at full width, icon (20px, 1.6 stroke) plus label, 8px radius, surface-2 hover. Active: red wash fill, red-wash-ink label at 500, solid red icon at 2 stroke. Two groups split by a hairline.
- **Mini-guide:** the same items as stacked icon over 0.65rem label.
- **Mobile chip row:** 8px-radius chips, surface-2 fill; the active chip inverts to ink fill with page-colour text.
- **Tabs:** 500 weight labels with a count pill; the active tab gets a 2px Studio Red underline.

### Stat Tile
A card holding a 48px tinted icon circle (40px on phones), a 500 ink-2 label, the stat number, and a meta line comparing with last week, green up-arrow or red down-arrow with the percentage.

### Ranked Row
Rank number in ink-3, a 40px lead (initials circle for people, initials 8px-square for brands, tinted numbered circle for topics), then the two-line body. Guest and sponsor rows prefix their reason line with channel dots. Topic rows replace the reason with a 6px bar: this week in Link Blue on the empty-bar track, with a 2px ink tick at last week's average, both on one scale shared by the visible rows.

### Initials Avatar
A 40px circle (or 8px square for brands) in one of the five tints, chosen by a stable hash of the name, showing first and last initials at 500.

**The Real Faces Only Rule.** People and brands appear as initials avatars. No stock photos, generated faces or placeholder headshots; the only images are YouTube thumbnails and channel art fetched at runtime.

### Channel Dot
An 8px circle in a stable hue per channel (ten fixed hues, 62% saturation, 52% lightness).

**The Named Dot Rule.** A channel dot never appears alone: it carries its channel's name visibly beside it, or as its title and accessible label.

### Thumbnail
16:9 YouTube image at 8px radius with a black-80% duration badge bottom-right in white tabular 0.65rem. The featured card overlays a 48px black-70% play circle that scales slightly on hover.

## Do's and Don'ts

### Do:
- **Do** give each page exactly one red primary button; make every other action secondary, ghost or a blue link.
- **Do** put icons in soft tinted circles from the five-tint family.
- **Do** keep ranked rows to two lines, with the reason a row ranks on line two.
- **Do** use tabular numerals for every compared figure, and show "vs last week" beside counts.
- **Do** reference colour tokens so the dark theme follows automatically.
- **Do** show an empty state that says what will appear and what has to happen first, in a dashed 12px card with a tinted icon.

### Don't:
- **Don't** use solid Studio Red for links, icons, borders or decoration; it belongs to the logo mark, the primary action and the active nav indicator.
- **Don't** use stock faces, illustrated people or generated images; use initials avatars and runtime YouTube thumbnails.
- **Don't** add a second type family or weights outside 400, 500 and 700.
- **Don't** use square-cornered buttons or inputs.
- **Don't** show a channel's colour dot without its name.
- **Don't** add shadows in dark mode; separate layers with surface steps.
