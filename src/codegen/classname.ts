import type { NodeIR, StyleSubset } from '../types.ts'
import { deltaE, SAME_COLOR_DE, toHex, toOklch, type Palette, type Token } from './colors.ts'

/**
 * Which families of token a colour may resolve into.
 *
 * The families are the whole guard: a border grey must never come out as
 * `bg-muted`, and body text must never come out as `bg-primary`, however close
 * the colours are. Within a family the nearest token wins.
 */
const BG_TOKENS = ['background', 'card', 'popover', 'muted', 'secondary', 'accent', 'primary'] as const
const FG_TOKENS = [
  'foreground',
  'muted-foreground',
  'primary-foreground',
  'secondary-foreground',
  'accent-foreground',
  'card-foreground',
  'primary',
  'destructive',
] as const
const LINE_TOKENS = ['border', 'input', 'ring', 'primary'] as const

/**
 * The generated page's palette, set once per emit run.
 *
 * A module-level handle rather than a parameter through every call site: the
 * classifier, the repeat diff and the emitter all ask the same question about
 * the same page, and threading the palette through `ClassOptions` would put a
 * page-level fact inside a per-node option bag.
 */
let PALETTE: Palette | null = null

export function usePalette(palette: Palette): void {
  PALETTE = palette
}

/** Same threshold the palette buckets at, so a token match is a real match. */
const TOKEN_DE = SAME_COLOR_DE

function nearestToken(hex: string, family: readonly Token[]): string | null {
  if (!PALETTE) return null
  const c = toOklch(hex)
  if (!c) return null
  let best: Token | null = null
  let bestD = Infinity
  for (const t of family) {
    const p = toOklch(PALETTE[t])
    if (!p) continue
    const d = deltaE(c, p)
    if (d < bestD) {
      bestD = d
      best = t
    }
  }
  return best && bestD <= TOKEN_DE ? best : null
}

/** A colour as a theme class when the palette holds it, otherwise the literal hex. */
function paint(prefix: string, hex: string, family: readonly Token[]): string {
  const token = nearestToken(hex, family)
  return token ? `${prefix}-${token}` : `${prefix}-[${hex}]`
}

/** Every number in a value, in order. Shorthands need all of them, not the max. */
const nums = (v: string): number[] => (v.match(/-?\d*\.?\d+/g) ?? []).map(Number)

/**
 * `padding` -> `p-[20px]`, `padding` `10px 16px` -> `py-[10px] px-[16px]`.
 * Tailwind arbitrary values map 1:1 to px, so the pixel diff in M5 measures the
 * same geometry the source had.
 */
function box(prefix: string, value: string): string[] {
  const n = nums(value)
  if (!n.length || n.every((x) => x === 0)) return []
  if (n.length === 1) return [`${prefix}-[${n[0]}px]`]
  if (n.length === 2) return [`${prefix}y-[${n[0]}px]`, `${prefix}x-[${n[1]}px]`]
  if (n.length === 3) return [`${prefix}t-[${n[0]}px]`, `${prefix}x-[${n[1]}px]`, `${prefix}b-[${n[2]}px]`]
  return [
    `${prefix}t-[${n[0]}px]`,
    `${prefix}r-[${n[1]}px]`,
    `${prefix}b-[${n[2]}px]`,
    `${prefix}l-[${n[3]}px]`,
  ]
}

/** `margin` is the one shorthand where the keywords carry the meaning. */
function margin(value: string): string[] {
  if (!value || value === '0px') return []
  const t = value.trim()
  if (/^auto$/.test(t)) return ['m-auto']
  // `0px auto` centres on the inline axis; the numeric part is already 0.
  if (/\bauto\b/.test(t)) return ['mx-auto']
  return box('m', value)
}

const TRANSPARENT = /^(rgba\(0,\s*0,\s*0,\s*0\)|transparent)$/

/** The display a `<span>`-emitted text leaf has to restore from its source tag. */
const TEXT_DISPLAY: Record<string, string> = {
  block: 'block',
  'inline-block': 'inline-block',
  // The parent `<ul>` is emitted as a plain div, so its `list-style: none` is
  // gone; a real `list-item` would sprout a marker that the source does not have.
  'list-item': 'block',
}


const ALIGN: Record<string, string> = {
  center: 'items-center',
  'flex-start': 'items-start',
  'flex-end': 'items-end',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
}

const JUSTIFY: Record<string, string> = {
  center: 'justify-center',
  'space-between': 'justify-between',
  'space-around': 'justify-around',
  'flex-start': 'justify-start',
  'flex-end': 'justify-end',
}

const WEIGHT: Record<string, string> = {
  '300': 'font-light',
  '400': 'font-normal',
  '500': 'font-medium',
  '600': 'font-semibold',
  '700': 'font-bold',
  '800': 'font-extrabold',
}

export interface ClassOptions {
  /**
   * A component's base may set `flex-col` (`Card` does), so a component states
   * its flex direction rather than leaning on the browser's `row` default.
   *
   * Box classes are *not* withheld: `cn` is tailwind-merge, so the className a
   * component appends wins over its own base per property. Dropping the measured
   * padding instead let a `Card` that is really the page's topbar lose its
   * `px-24` and shift everything to its right.
   */
  component?: boolean
  /** A flex child sizes itself from the layout; writing the measured width would freeze it. */
  skipSize?: boolean
}

/** The Tailwind classes for one node. Ordered layout → box → paint, never sorted blindly. */
export function classNames(style: StyleSubset, opts: ClassOptions = {}): string[] {
  const out: string[] = []

  if (style.display === 'flex') {
    out.push('flex')
    // A component's own base may set a column — `Card` ships `flex-col` — and
    // the browser's `row` default only wins when nothing says otherwise. On a
    // component the direction is therefore always stated, or a row of children
    // silently stacks.
    if (style.flexDirection === 'column') out.push('flex-col')
    else if (style.flexDirection === 'row-reverse') out.push('flex-row-reverse')
    else if (style.flexDirection === 'column-reverse') out.push('flex-col-reverse')
    else if (opts.component) out.push('flex-row')
  } else if (style.display === 'grid') {
    out.push('grid')
    const cols = style.gridTemplateColumns
    // `none` and the no-columns defaults carry no digits; a real track list does.
    if (cols && /\d/.test(cols)) out.push(`grid-cols-[${cols.replace(/\s+/g, '_')}]`)
  } else if (style.display === 'none') {
    out.push('hidden')
  }

  // A component's base may also state a flow it did not have: `Badge` ships
  // `justify-center`, and a badge the source laid out from the left would centre
  // instead. Where the source says nothing, the component states nothing.
  if (style.display === 'flex') {
    if (ALIGN[style.alignItems]) out.push(ALIGN[style.alignItems])
    else if (opts.component) out.push('items-stretch')
    if (JUSTIFY[style.justifyContent]) out.push(JUSTIFY[style.justifyContent])
    else if (opts.component && style.flexDirection !== 'column' && style.flexDirection !== 'column-reverse') out.push('justify-start')
  } else {
    if (ALIGN[style.alignItems]) out.push(ALIGN[style.alignItems])
    if (JUSTIFY[style.justifyContent]) out.push(JUSTIFY[style.justifyContent])
  }

  // A gap is real layout even inside a component: the card's own spacing is the
  // card's, but the distance between two cards is the parent's.
  const gap = nums(style.gap)[0]
  if (gap) out.push(`gap-[${gap}px]`)
  // A component's base may also carry spacing the source never had: `Card` ships
  // `gap-(--card-spacing)`, 16px between every child, where the source spaced its
  // children with margins. Left alone that is 16px per child of accumulated drift.
  else if (opts.component) out.push('gap-0')

  out.push(...box('p', style.padding))
  out.push(...margin(style.margin))

  const radius = nums(style.borderRadius)[0]
  if (radius) out.push(radius >= 999 ? 'rounded-full' : `rounded-[${radius}px]`)

  const bw = nums(style.borderWidth)[0]
  if (bw) {
    out.push(bw === 1 ? 'border' : `border-[${bw}px]`)
    // The base layer paints every border `border-border`, so only a different
    // colour needs saying.
    const line = TRANSPARENT.test(style.borderColor) ? null : toHex(style.borderColor)
    if (line && nearestToken(line, LINE_TOKENS) !== 'border') out.push(paint('border', line, LINE_TOKENS))
  }

  const bg = TRANSPARENT.test(style.backgroundColor) ? null : toHex(style.backgroundColor)
  if (bg) out.push(paint('bg', bg, BG_TOKENS))

  if (style.boxShadow && style.boxShadow !== 'none') {
    out.push(`shadow-[${style.boxShadow.replace(/\s+/g, '_')}]`)
  }

  const op = parseFloat(style.opacity)
  if (op && op < 1) out.push(`opacity-${Math.round(op * 100)}`)

  if (style.overflow === 'hidden') out.push('overflow-hidden')

  if (!opts.skipSize) {
    const w = nums(style.width)[0]
    const h = nums(style.height)[0]
    if (style.width === '100%') out.push('w-full')
    else if (w && style.position !== 'absolute') out.push(`w-[${w}px]`)
    if (style.height === '100%') out.push('h-full')
    else if (h && style.position !== 'absolute') out.push(`h-[${h}px]`)
  }

  if (style.position === 'absolute') out.push('absolute')
  if (style.position === 'fixed') out.push('fixed')

  return out
}

/** Classes that belong to the text run itself, applied to whatever element holds it. */
export function textClasses(style: StyleSubset): string[] {
  const out: string[] = []
  // A text leaf is emitted as a `<span>`, but the source may be a `<p>`, `<h1>`
  // or `<li>` — an inline span shrink-wraps to the glyphs and a list item loses
  // its line break, so two `<li>`s run together. `display` is restored from the
  // source so the line box matches, and its margin with it: a heading's
  // `margin-bottom: 8px` is what spaces the copy below, and a `<span>` has none.
  const display = TEXT_DISPLAY[style.display]
  if (display) {
    out.push(display)
    out.push(...box('p', style.padding))
    out.push(...margin(style.margin))
  }
  const size = nums(style.fontSize)[0]
  if (size) out.push(`text-[${size}px]`)
  if (WEIGHT[style.fontWeight]) out.push(WEIGHT[style.fontWeight])
  // Tailwind's preflight sets `html { line-height: 1.5 }`, but a browser's own
  // `normal` is nearer 1.2 for a heading. Leaving it means every text block is a
  // few pixels taller than the source, and the offset compounds down the page.
  // `leading-[normal]` and not `leading-normal`: that utility means 1.5, which is
  // the very value being replaced.
  const lh = style.lineHeight
  if (lh === 'normal') out.push('leading-[normal]')
  else if (/\d/.test(lh) && !lh.includes('%')) out.push(`leading-[${lh.replace(/\s+/g, '_')}]`)
  else if (/[\d.]+%/.test(lh)) out.push(`leading-[${(parseFloat(lh) / 100).toFixed(2)}]`)
  const fg = TRANSPARENT.test(style.color) ? null : toHex(style.color)
  if (fg) out.push(paint('text', fg, FG_TOKENS))
  return out
}

/** True when the node adds nothing a parent's flow would not already do. */
export function isLayoutOnly(n: NodeIR): boolean {
  return (
    n.children.length === 0 &&
    !n.text &&
    n.kind === 'container' &&
    !nums(n.style.padding).some((x) => x !== 0) &&
    !nums(n.style.borderWidth).some((x) => x !== 0)
  )
}
