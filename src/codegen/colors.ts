import { converter, formatCss, parse, wcagContrast } from 'culori'
import type { IR, NodeIR, StyleSubset } from '../types.ts'

/**
 * The page's palette, read off the IR and answered as oklch.
 *
 * Everything here is deterministic: which colour becomes which shadcn token is
 * decided by measurement (area, contrast, position in the tree), never by a
 * guess about what a page "usually" looks like.
 */

const convertOklch = converter('oklch')

export interface Oklch {
  l: number
  c: number
  h: number
}

/** Computed `rgb(r, g, b)` / `rgb(r, g, b, a)` -> hex, or null when invisible. */
export function toHex(value: string | null | undefined): string | null {
  if (!value) return null
  const m = /^rgba?\(([^)]+)\)$/.exec(value.trim())
  if (!m) return null
  const parts = m[1].split(',').map((s) => parseFloat(s))
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null
  const [r, g, b, a = 1] = parts
  if (a === 0) return null
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/**
 * The alpha a computed colour carries, 0..1.
 *
 * Kept apart from `toHex` because the two answer different questions. `toHex`
 * identifies a colour for the palette, where a 10% wash and the solid it washes
 * are the same hue. The emitter needs the alpha itself: a `rgba(183,0,17,0.1)`
 * badge painted as `bg-[#b70011]` is a solid crimson pill where the source had a
 * barely-there tint, which is a far bigger visual error than either colour is.
 */
export function alphaOf(value: string | null | undefined): number {
  if (!value) return 1
  const m = /^rgba\(([^)]+)\)$/.exec(value.trim())
  if (!m) return 1
  const parts = m[1].split(',').map((s) => parseFloat(s))
  const a = parts[3]
  return Number.isFinite(a) ? Math.max(0, Math.min(1, a)) : 1
}

/** The IR carries `rgb()`, the palette holds hex. One conversion, in one place. */
export const hexOf = (value: string | null | undefined): string | null => toHex(value)

export function toOklch(hex: string): Oklch | null {
  const parsed = parse(hex)
  if (!parsed) return null
  const c = convertOklch(parsed)
  if (!c || !Number.isFinite(c.l)) return null
  return { l: c.l, c: c.c ?? 0, h: Number.isFinite(c.h) ? (c.h as number) : 0 }
}

/**
 * Perceptual distance, in oklch.
 *
 * Chroma is down-weighted because the eye resolves lightness differences far
 * better than hue differences at low chroma: two greys 0.06 apart in `c` are
 * the same grey, while two navies 0.06 apart in `l` are visibly not.
 */
export function deltaE(a: Oklch, b: Oklch): number {
  const dl = a.l - b.l
  const dc = (a.c - b.c) * 0.5
  // Hue is an angle, so the shorter way round is the real distance.
  const dh = 2 * Math.sqrt(Math.max(0, a.c * b.c)) * Math.sin(((a.h - b.h) * Math.PI) / 360)
  return Math.sqrt(dl * dl + dc * dc + dh * dh)
}

const TRANSPARENT = /^(rgba\(0,\s*0,\s*0,\s*0\)|transparent)$/

/**
 * How close two colours have to be to count as the same colour.
 *
 * Tight on purpose: computed styles carry the authored value exactly, so this
 * only has to absorb representation noise (`#fff` vs `rgb(255,255,255)`), not
 * design decisions. The page paper `#fafafa` and its cards `#ffffff` are 0.015
 * apart — a threshold that swallowed those would answer `--card` with the page
 * background and leave the cards invisible in the diff. Shared with the class
 * emitter, which must resolve a colour to a token under the same rule.
 */
export const SAME_COLOR_DE = 0.005

/** Colours the source actually paints, with how much of the page they cover. */
export interface ColorUse {
  hex: string
  oklch: Oklch
  /** Box area summed over the painted nodes. The page's own paper wins by area. */
  area: number
  /** Nodes painted with it, which is how a dominant text or border colour is found. */
  count: number
  /**
   * Nodes that paint it as their text colour.
   *
   * Tracked apart from `count` because a colour doing double duty — the near-black
   * that is both the page's prose and its buttons — is still the page's prose, and
   * a `textOnly` flag would throw it away and leave the foreground grey.
   */
  textCount: number
  /** True when at least one node using it responds to the pointer. */
  interactive: boolean
  /** True when at least one node using it draws a border or a shadow. */
  raises: boolean
}

interface Fields {
  area: number
  count: number
  textCount: number
  interactive: boolean
  raises: boolean
}

/**
 * Bucket every painted colour by perceptual closeness, then measure the buckets.
 *
 * Representative-by-area rather than by average: a bucket that is one clean white
 * plus a near-white should come out exactly white, because the page's paper *is*
 * white and rounding it to `#fcfcfd` would show up in the diff.
 */
export function colorUses(ir: IR, backgroundHex: string): ColorUse[] {
  const bg = toOklch(backgroundHex)
  const nodes = Object.values(ir.nodes).filter((n) => n.visible && n.tag !== 'html')
  const buckets: { rep: { hex: string; oklch: Oklch }; fields: Fields }[] = []

  const add = (hex: string, s: StyleSubset, n: NodeIR, field: 'bg' | 'fg' | 'border') => {
    const oklch = toOklch(hex)
    if (!oklch) return
    const area = field === 'bg' ? Math.max(0, n.box.w) * Math.max(0, n.box.h) : 0

    let bucket = buckets.find((b) => deltaE(b.rep.oklch, oklch) < SAME_COLOR_DE)
    if (!bucket) {
      bucket = {
        rep: { hex, oklch },
        fields: { area: 0, count: 0, textCount: 0, interactive: false, raises: false },
      }
      buckets.push(bucket)
    }

    const f = bucket.fields
    f.area += area
    f.count += 1
    if (field === 'fg') f.textCount += 1
    // A bigger paint of the same colour is the better representative.
    if (area > 0 && area > f.area - area) bucket.rep = { hex, oklch }
    if (s.cursor === 'pointer') f.interactive = true
    if (parseFloat(s.borderWidth) > 0 || (s.boxShadow && s.boxShadow !== 'none')) f.raises = true
  }

  for (const n of nodes) {
    const s = n.style
    if (!TRANSPARENT.test(s.backgroundColor)) {
      const hex = toHex(s.backgroundColor)
      if (hex) add(hex, s, n, 'bg')
    }
    if (!TRANSPARENT.test(s.color)) {
      const hex = toHex(s.color)
      if (hex) add(hex, s, n, 'fg')
    }
    if (parseFloat(s.borderWidth) > 0 && !TRANSPARENT.test(s.borderColor)) {
      const hex = toHex(s.borderColor)
      if (hex) add(hex, s, n, 'border')
    }
  }

  return buckets
    .map((b) => ({ hex: b.rep.hex, oklch: b.rep.oklch, ...b.fields }))
    .sort((a, b) => b.area - a.area || b.count - a.count)
}

/** The shadcn token names the generated stylesheet has to answer. */
export const TOKENS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'border',
  'input',
  'ring',
  'destructive',
] as const

export type Token = (typeof TOKENS)[number]

export type Palette = Record<Token, string>

/**
 * Which colour plays which role.
 *
 * The order matters and is the whole design: `primary` is claimed *before* the
 * foreground, because a page whose only strong fill is its call-to-action has
 * that fill in its text colours too (white on the button), and letting the text
 * rule take it first would leave the button looking like body copy.
 */
export function assignPalette(backgroundHex: string, uses: ColorUse[]): Palette {
  const bg = toOklch(backgroundHex)
  const out = {} as Palette
  // Four decimals is finer than any display resolves, and `formatCss`'s full
  // float output turns a plain white into `oklch(1.0000000000000002 0 0)`.
  const r = (n: number) => Math.round(n * 1e4) / 1e4
  const round = (c: Oklch): string => formatCss({ mode: 'oklch', l: r(c.l), c: r(c.c), h: r(c.h) })

  const take = (token: Token, hex: string) => {
    const oklch = toOklch(hex) ?? { l: 0, c: 0, h: 0 }
    out[token] = round(oklch)
    return { hex, oklch }
  }

  const bgToken = take('background', backgroundHex)
  const background = bg ?? toOklch(backgroundHex) ?? bgToken.oklch
  const foreground = { l: 1 - background.l, c: 0, h: 0 }
  const role = (c: Oklch) => (background.l < 0.5 ? 'dark' : 'light')

  const distinct = (c: Oklch, min = 0.02) => bg && deltaE(c, bg) > min

  /** The strongest contrast against a surface, which is what readable text needs. */
  const bestContrast = (against: { hex: string }, pool: ColorUse[]): ColorUse | undefined =>
    pool
      .filter((u) => u.count > 0)
      .sort((a, b) => wcagContrast(a.hex, against.hex) - wcagContrast(b.hex, against.hex))
      .at(-1)

  // --- primary: what the page's buttons are painted with -------------------
  const interactive = uses
    .filter((u) => u.interactive && u.area > 0 && distinct(u.oklch, 0.05))
    .sort((a, b) => b.area - a.area)
  let primary = interactive[0]
  if (!primary) {
    // No filled button anywhere: the page's own strongest non-background fill is
    // still a better primary than shadcn's grey default.
    primary = uses.filter((u) => u.area > 0 && distinct(u.oklch, 0.05)).sort((a, b) => b.area - a.area)[0]
  }
  const primaryColor = primary ? take('primary', primary.hex) : take('primary', '#171717')

  // --- card / popover: a surface that is raised, not just painted ----------
  // --- card / popover: a surface that is raised, not just painted ----------
  // "Raised" alone is not enough to tell a card from a button: both draw a border
  // or a shadow. What separates them is scale — a surface covers a real share of
  // the page, a control is a chip in it. Anything smaller than a tenth of the
  // largest paint is a control, and the page's own paper is the better answer.
  const largest = uses[0]?.area ?? 0
  const raised = uses.filter((u) => u.area > largest * 0.1 && u.raises && distinct(u.oklch, 0.01))
  const card = raised[0] ?? { hex: backgroundHex, oklch: background }
  take('card', card.hex)

  // --- foreground: the colour the page's prose is set in -------------------
  // --- foreground: the colour the page's prose is set in -------------------
  // Ranked by how many nodes set text in it, not by paint area: a colour used for
  // a button fill *and* for 45 prose nodes is still the page's prose, and the
  // `area === 0` filter that keeps primaries out of the text pool would drop it.
  const textPool = uses.filter((u) => u.textCount > 0 && distinct(u.oklch, 0.1))
  const prose = [...textPool].sort((a, b) => b.textCount - a.textCount)
  const fgPick = prose[0] ?? { hex: role(bgToken.oklch) === 'dark' ? '#fafafa' : '#0a0a0a' }
  take('foreground', fgPick.hex)

  // --- muted-foreground: the next text colour down -------------------------
  // Chosen by proximity to the foreground rather than absolute contrast, so a
  // page whose secondary grey sits near its black gets a near-black muted tone
  // and not one that happens to be far from the paper.
  const dim = textPool
    .filter((u) => u.hex !== fgPick.hex)
    .sort((a, b) => deltaE(a.oklch, fgPick.oklch) - deltaE(b.oklch, fgPick.oklch))
    .at(0)
  // No second text colour on the page: step the foreground toward the background
  // rather than inventing a hue.
  const mutedFg = dim
    ? { hex: dim.hex, oklch: dim.oklch }
    : { hex: backgroundHex, oklch: { l: (background.l + foreground.l) / 2 + 0.12, c: 0, h: 0 } }
  take('muted-foreground', mutedFg.hex)

  // --- border: the colour the page draws its hairlines with ---------------
  const borderUse = uses
    .filter((u) => u.raises && distinct(u.oklch, 0.005))
    .find((u) => u.hex !== card.hex && u.hex !== primaryColor.hex)
  take('border', borderUse?.hex ?? mutedFg.hex)

  // --- secondary / muted / accent: the quiet surfaces ---------------------
  const quiet =
    uses
      .filter((u) => u.area > 0 && distinct(u.oklch, 0.01) && u.hex !== primaryColor.hex && u.hex !== card.hex)
      .sort((a, b) => b.area - a.area)[0] ?? { hex: mutedFg.hex, oklch: mutedFg.oklch }
  take('secondary', quiet.hex)
  take('muted', quiet.hex)
  take('accent', quiet.hex)

  const on = (surface: { hex: string; oklch: Oklch }) => {
    const pick = bestContrast(surface, uses.filter((u) => u.textCount > 0))
    return pick ? pick.hex : role(surface.oklch) === 'dark' ? '#fafafa' : '#0a0a0a'
  }

  take('primary-foreground', on(primaryColor))
  take('card-foreground', on(card))
  take('popover', card.hex)
  take('popover-foreground', on(card))
  take('secondary-foreground', on(quiet))
  take('accent-foreground', on(quiet))
  take('input', borderUse?.hex ?? mutedFg.hex)
  // The focus ring is the primary at low chroma; a full-strength ring flashes
  // harder than anything the source page ever drew.
  take('ring', primaryColor.hex)
  take('destructive', '#e7000b')

  return out
}

/**
 * Whether the page is dark, from the paper it is drawn on rather than a guess.
 *
 * `l` is perceptual lightness, so the midpoint is the honest cutoff: a page on
 * `#808080` is halfway, and either answer is defensible; above it is light.
 */
export function isDark(backgroundHex: string): boolean {
  const bg = toOklch(backgroundHex)
  return bg ? bg.l < 0.5 : false
}

/** The surface the page itself is drawn on. */
export function pageBackground(ir: IR): string {
  const body = Object.values(ir.nodes).find((n) => n.tag === 'body' || n.tag === 'html')
  const own = hexOf(body?.style.backgroundColor)
  if (own) return own

  // No explicit body fill: the largest painted area is the next best answer.
  for (const c of [...ir.colors].sort((a, b) => b.area - a.area)) {
    const hex = hexOf(c.value)
    if (hex) return hex
  }
  return '#ffffff'
}
