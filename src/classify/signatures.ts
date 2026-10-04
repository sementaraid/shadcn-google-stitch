import type { NodeIR } from '../types.ts'
import {
  area, descendants, hasSideBorder, iconChild, isDark, isFilled, isOpaqueBg, isRound, kids, px, textContent,
  type Ctx, type Signature,
} from './signature.ts'

export type ComponentName =
  | 'Button' | 'Input' | 'Label' | 'Badge' | 'Card' | 'Avatar' | 'Checkbox'
  | 'Separator' | 'Table' | 'Tabs' | 'Switch' | 'Progress' | 'Alert'

const CTRL_TAGS = new Set(['button', 'input', 'select', 'textarea'])

/**
 * Scoring is `(base + sum(signals)) / (1 + n)`. `base` is what a signature is
 * worth once its `requires` gate has passed: gates already carry real
 * information (a `<label>` tag, a 1px-tall box), so a node that clears one
 * should not have to also satisfy every soft signal to reach the accept line.
 * Signatures whose gate is weak carry no base and must earn the score.
 */
export const SIGNATURES: Signature[] = [
  {
    name: 'Button',
    base: 0.3,
    requires: (n) =>
      // A pill-radius control or role=checkbox is a Switch or Checkbox, whatever
      // its tag says.
      (n.kind === 'control' && n.role !== 'switch' && n.role !== 'checkbox') ||
      n.role === 'button' ||
      (n.tag === 'a' && n.style.cursor === 'pointer' && Boolean(n.text)),
    weight: {
      realControl: (n) => (CTRL_TAGS.has(n.tag) ? 1 : 0),
      clickable: (n) => (n.style.cursor === 'pointer' ? 1 : 0),
      sized: (n) => (n.box.h >= 24 && n.box.h <= 64 ? 1 : 0),
      surface: (n, ctx) => (isFilled(n, ctx) || px(n.style.borderWidth) > 0 ? 1 : 0),
      hasLabel: (n, ctx) => (n.text || n.ariaLabel || iconChild(n, ctx) ? 1 : 0),
    },
    variants: {
      variant: (n, ctx) => {
        if (!n.text && !textContent(n, ctx).trim()) return 'ghost'
        if (isFilled(n, ctx)) return isDark(n.style.backgroundColor) ? 'default' : 'secondary'
        return px(n.style.borderWidth) > 0 ? 'outline' : 'ghost'
      },
      size: (n, ctx) =>
        // Shadcn gives an icon-only button its own size rather than a variant.
        !n.text && !textContent(n, ctx).trim() ? 'icon' : n.box.h >= 44 ? 'lg' : n.box.h <= 32 ? 'sm' : 'default',
    },
    conflicts: ['Badge', 'Tabs', 'Switch'],
  },

  {
    name: 'Input',
    requires: (n, ctx) =>
      n.tag === 'input' ||
      n.tag === 'textarea' ||
      (n.kind === 'control' && n.tag === 'select') ||
      (n.kind === 'container' &&
        n.box.w >= 80 &&
        n.box.h >= 28 &&
        n.box.h <= 72 &&
        px(n.style.borderWidth) > 0 &&
        kids(n, ctx).length <= 2),
    weight: {
      formTag: (n) => (n.tag === 'input' || n.tag === 'textarea' ? 1 : 0),
      bordered: (n) => (px(n.style.borderWidth) > 0 ? 1 : 0),
      emptyish: (n, ctx) => (textContent(n, ctx).trim().length === 0 ? 1 : 0),
      radius: (n) => (px(n.style.borderRadius) > 0 ? 1 : 0),
      wide: (n) => (n.box.w >= 120 ? 1 : 0),
    },
    variants: {
      // Shadcn ships these as separate components, so the variant is really a
      // component name. The emitter reads this field to pick which one.
      kind: (n, ctx) => (n.tag === 'textarea' ? 'Textarea' : looksLikeSelect(n, ctx) ? 'Select' : null),
    },
    conflicts: ['Card', 'Button'],
  },

  {
    name: 'Label',
    base: 0.15,
    // `for=` is the real tell and only the tag carries it. A styled div with
    // short text is a heading or a caption far more often than a label.
    requires: (n) => n.tag === 'label' || n.role === 'label',
    weight: {
      labelTag: (n) => (n.tag === 'label' ? 1 : 0),
      short: (n) => ((n.text?.length ?? 99) <= 40 ? 1 : 0),
      noBg: (n, ctx) => (isFilled(n, ctx) ? 0 : 1),
    },
  },

  {
    name: 'Badge',
    base: 0.1,
    requires: (n, ctx) =>
      n.kind !== 'control' &&
      !n.isLeafOpaque &&
      Boolean(n.text) &&
      n.box.h >= 14 &&
      n.box.h <= 40 &&
      n.children.length <= 2 &&
      // A badge sits inside a line of other content rather than filling a row.
      (n.box.w <= 220 || n.style.display.startsWith('inline')),
    weight: {
      small: (n) => (n.box.h <= 32 ? 1 : 0.5),
      // Pill or small radius. A square-cornered box with text is a table cell.
      rounded: (n) => (px(n.style.borderRadius) >= 4 ? 1 : 0),
      surface: (n, ctx) => (isFilled(n, ctx) || px(n.style.borderWidth) > 0 ? 1 : 0),
      shortText: (n) => ((n.text?.length ?? 99) <= 24 ? 1 : 0),
      nonInteractive: (n) => (n.style.cursor === 'pointer' ? 0 : 1),
      padded: (n) => (px(n.style.padding) > 0 ? 1 : 0),
    },
    variants: {
      variant: (n, ctx) => (isFilled(n, ctx) ? (isDark(n.style.backgroundColor) ? 'default' : 'secondary') : 'outline'),
    },
    conflicts: ['Button', 'Card'],
  },

  {
    name: 'Card',
    base: 0.1,
    requires: (n, ctx) =>
      n.kind === 'container' &&
      n.box.w >= 120 &&
      n.box.h >= 60 &&
      n.children.length >= 2 &&
      // An icon in the corner is the Alert's tell, and Alert outranks Card, so
      // a framed box with an icon never lands here.
      !iconChild(n, ctx) &&
      (isRound(n) || px(n.style.borderWidth) > 0 || n.style.boxShadow !== 'none' || isOpaqueBg(n.style.backgroundColor)),
    weight: {
      framed: (n) =>
        px(n.style.borderWidth) > 0 || n.style.boxShadow !== 'none' ? 1 : isOpaqueBg(n.style.backgroundColor) ? 0.6 : 0,
      regions: (n, ctx) => (kids(n, ctx).filter((c) => c.visible).length >= 2 ? 1 : 0),
      hasText: (n, ctx) => (textContent(n, ctx).trim().length > 0 ? 1 : 0),
      padded: (n) => (n.style.padding.split(' ').map(px).some((p) => p >= 8) ? 1 : 0),
      notControl: (n) => (CTRL_TAGS.has(n.tag) ? 0 : 1),
      // A card is a leaf unit of layout. A page-sized wrapper is a layout region,
      // which is also what keeps the page shell out of this signature.
      sized: (n) => (area(n) <= 640_000 ? 1 : 0),
    },
    variants: {
      variant: (n, ctx) => (isFilled(n, ctx) ? null : 'outline'),
    },
    conflicts: ['Input', 'Alert'],
  },

  {
    name: 'Avatar',
    // The round-square gate is weak on its own, so Avatar earns its score.
    base: 0.1,
    requires: (n) => {
      const ratio = n.box.w / Math.max(n.box.h, 1)
      // The 24px floor keeps a Switch knob (16px) from reading as an avatar.
      return (
        n.box.w >= 24 &&
        n.box.w <= 96 &&
        ratio > 0.85 &&
        ratio < 1.18 &&
        px(n.style.borderRadius) >= Math.min(n.box.w, n.box.h) / 2 - 2
      )
    },
    weight: {
      round: (n) => (px(n.style.borderRadius) >= Math.min(n.box.w, n.box.h) / 2 - 2 ? 1 : 0),
      square: (n) => {
        const r = n.box.w / Math.max(n.box.h, 1)
        return r > 0.88 && r < 1.14 ? 1 : 0
      },
      // An empty circle is still an avatar: the image is just missing. Only a
      // lot of text rules it out.
      content: (n, ctx) => {
        if (kids(n, ctx).some((c) => c.kind === 'image')) return 1
        const len = textContent(n, ctx).trim().length
        return len === 0 ? 0.5 : len <= 3 ? 1 : 0
      },
      sized: (n) => (n.box.w <= 64 ? 1 : 0.5),
    },
    variants: {
      size: (n) => (n.box.w <= 28 ? 'sm' : n.box.w >= 64 ? 'lg' : 'default'),
    },
    conflicts: ['Badge', 'Checkbox'],
  },

  {
    name: 'Checkbox',
    base: 0.1,
    requires: (n) =>
      (n.tag === 'input' && n.role === 'checkbox') ||
      n.role === 'checkbox' ||
      (n.box.w >= 10 &&
        n.box.w <= 32 &&
        Math.abs(n.box.w - n.box.h) <= 6 &&
        px(n.style.borderWidth) > 0),
    weight: {
      checkboxTag: (n) => (n.tag === 'input' || n.role === 'checkbox' ? 1 : 0),
      small: (n) => (n.box.w <= 28 ? 1 : 0),
      square: (n) => (Math.abs(n.box.w - n.box.h) <= 4 ? 1 : 0),
      smallRadius: (n) => {
        const r = px(n.style.borderRadius)
        return r >= 0 && r <= 10 ? 1 : 0
      },
      noText: (n, ctx) => (textContent(n, ctx).trim().length === 0 ? 1 : 0),
    },
    variants: {
      // Read the box, do not assume. A checked box carries a check glyph or is
      // filled with an accent colour rather than the page surface; an unchecked
      // one is the page's own background behind a border.
      checked: (n, ctx) => (iconChild(n, ctx) || isFilled(n, ctx) ? 'checked' : 'unchecked'),
    },
    conflicts: ['Avatar', 'Switch'],
  },

  {
    name: 'Separator',
    requires: (n) => (n.box.w <= 3 && n.box.h >= 16) || (n.box.h <= 3 && n.box.w >= 16),
    weight: {
      thin: (n) => (Math.min(n.box.w, n.box.h) <= 3 ? 1 : 0),
      long: (n) => (Math.max(n.box.w, n.box.h) >= 24 ? 1 : 0),
      painted: (n) => (isOpaqueBg(n.style.backgroundColor) || px(n.style.borderWidth) > 0 ? 1 : 0),
      empty: (n) => (n.children.length === 0 && !n.text ? 1 : 0),
    },
    variants: {
      orientation: (n) => (n.box.h > n.box.w ? 'vertical' : 'horizontal'),
    },
    conflicts: ['Progress'],
  },

  {
    name: 'Table',
    base: 0.1,
    requires: (n, ctx) => {
      if (n.tag === 'table' || n.role === 'table' || n.role === 'grid') return true
      // Grid shape: two or more rows, each with the same number of cells.
      const rows = kids(n, ctx).filter((c) => c.visible)
      if (rows.length < 2) return false
      const cells = rows.map((r) => kids(r, ctx).filter((c) => c.visible))
      return cells.every((c) => c.length === cells[0].length) && cells[0].length >= 2 && cells[0].length <= 12
    },
    weight: {
      tableTag: (n) => (n.tag === 'table' ? 1 : 0),
      role: (n) => (n.role === 'table' || n.role === 'grid' ? 1 : 0),
      rowParts: (n, ctx) => (kids(n, ctx).some((c) => ['thead', 'tbody', 'tr'].includes(c.tag)) ? 1 : 0),
      cellTags: (n, ctx) => (descendants(n, ctx).some((d) => d.tag === 'td' || d.tag === 'th') ? 1 : 0),
      uniform: (n, ctx) => {
        const rows = kids(n, ctx).filter((c) => c.visible)
        if (rows.length < 2) return 0
        const w = rows.map((r) => Math.round(r.box.w / 8))
        return w.every((x) => x === w[0]) ? 1 : 0
      },
    },
    conflicts: ['Card', 'Tabs'],
  },

  {
    name: 'Tabs',
    base: 0.15,
    // A row of same-weight labels. Real nav links are body weight, which is what
    // separates a tab strip from a menu bar.
    requires: (n, ctx) => {
      if (n.role === 'tablist' || kids(n, ctx).some((c) => c.role === 'tab')) return true
      const labelled = kids(n, ctx).filter((c) => c.visible && c.text && px(c.style.fontWeight) >= 500)
      return labelled.length >= 2
    },
    weight: {
      // Weights describe layout, not semantics: ARIA lives in `requires`. A tab
      // strip with no ARIA at all must still be able to reach the accept line.
      heavyKids: (n, ctx) => {
        const labelled = kids(n, ctx).filter((c) => c.visible && c.text && px(c.style.fontWeight) >= 500)
        return labelled.length >= 2 ? 1 : 0
      },
      // A tab strip usually has a rule under it and an active tab with its own
      // edge. `px` reads the shorthand, so a border on one side counts.
      underline: (n, ctx) => (kids(n, ctx).some((c) => px(c.style.borderWidth) > 0) ? 1 : 0),
      horizontal: (n) => (n.style.display.includes('flex') && n.style.flexDirection.startsWith('row') ? 1 : 0.5),
      padded: (n, ctx) => (kids(n, ctx).some((c) => px(c.style.padding) > 0) ? 1 : 0),
      ruled: (n) => (px(n.style.borderWidth) > 0 ? 1 : 0),
    },
    conflicts: ['Button', 'Table'],
  },

  {
    name: 'Switch',
    base: 0.1,
    requires: (n) =>
      n.role === 'switch' ||
      (px(n.style.borderRadius) >= n.box.h / 2 - 2 &&
        n.box.w >= 28 &&
        n.box.w <= 72 &&
        n.box.h >= 14 &&
        n.box.h <= 34 &&
        isOpaqueBg(n.style.backgroundColor)),
    weight: {
      role: (n) => (n.role === 'switch' ? 1 : 0),
      pill: (n) => (px(n.style.borderRadius) >= n.box.h / 2 - 2 ? 1 : 0),
      ratio: (n) => (n.box.w / Math.max(n.box.h, 1) >= 1.4 ? 1 : 0),
      painted: (n) => (isOpaqueBg(n.style.backgroundColor) ? 1 : 0),
      noText: (n, ctx) => (textContent(n, ctx).trim().length === 0 ? 1 : 0),
    },
    variants: {
      // The knob's position is the state: off sits at the start edge, on is
      // translated toward the end. Measuring it beats assuming the resting
      // value, which is what an unread `checked` would amount to.
      checked: (n, ctx) => {
        const knob = kids(n, ctx).find((c) => c.visible && c.box.h < n.box.h && c.box.w < n.box.w)
        if (!knob || !n.box.w) return 'unchecked'
        const lead = knob.box.x - n.box.x
        const trail = n.box.x + n.box.w - (knob.box.x + knob.box.w)
        // Off rests at the leading edge, on is pushed to the trailing one.
        return lead + 1 < trail ? 'unchecked' : 'checked'
      },
    },
    conflicts: ['Badge', 'Checkbox'],
  },

  {
    name: 'Progress',
    base: 0.2,
    requires: (n, ctx) =>
      n.role === 'progressbar' ||
      (n.box.h >= 4 && n.box.h <= 14 && n.box.w >= 60 && isOpaqueBg(n.style.backgroundColor) && !textContent(n, ctx).trim()),
    weight: {
      role: (n) => (n.role === 'progressbar' ? 1 : 0),
      thin: (n) => (n.box.h <= 14 ? 1 : 0),
      wide: (n) => (n.box.w >= 60 ? 1 : 0),
      rounded: (n) => (px(n.style.borderRadius) > 0 ? 1 : 0),
      // The track is a shell; its text, if any, sits in the fill.
      noText: (n, ctx) => (textContent(n, ctx).trim().length === 0 ? 1 : 0),
    },
    variants: {
      // The filled portion is the first child, measured against the track.
      value: (n, ctx) => {
        const fill = kids(n, ctx)[0]
        if (!fill || !n.box.w) return '0'
        return String(Math.round((fill.box.w / n.box.w) * 100))
      },
    },
    conflicts: ['Separator'],
  },

  {
    name: 'Alert',
    requires: (n, ctx) =>
      n.kind === 'container' &&
      n.box.w >= 180 &&
      n.box.h >= 40 &&
      Boolean(iconChild(n, ctx)) &&
      textContent(n, ctx).trim().length > 0 &&
      (hasSideBorder(n) || isOpaqueBg(n.style.backgroundColor)),
    weight: {
      framed: (n) => (hasSideBorder(n) || isOpaqueBg(n.style.backgroundColor) ? 1 : 0),
      hasIcon: (n, ctx) => (iconChild(n, ctx) ? 1 : 0),
      hasTitle: (n, ctx) => (descendants(n, ctx).some((d) => px(d.style.fontWeight) >= 600) ? 1 : 0),
      hasBody: (n, ctx) => (kids(n, ctx).some((c) => textContent(c, ctx).trim().length > 0) ? 1 : 0),
      rounded: (n) => (px(n.style.borderRadius) > 0 ? 1 : 0),
    },
    conflicts: ['Card'],
  },
]

/** `select` is a control tag but presents as a form field, not a button. */
function looksLikeSelect(n: NodeIR, ctx: Ctx): boolean {
  if (n.tag === 'select') return true
  return (
    n.role === 'combobox' ||
    (px(n.style.borderWidth) > 0 && kids(n, ctx).some((c) => c.style.position === 'absolute'))
  )
}
