import type { NodeIR, StyleSubset } from '../types.ts'
import { alphaOf, deltaE, SAME_COLOR_DE, toHex, toOklch, type Palette, type Token } from './colors.ts'

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
function paint(prefix: string, hex: string, family: readonly Token[], alpha = 1): string {
  const token = nearestToken(hex, family)
  // Tailwind writes alpha as a `/10` modifier on the *colour*, so it survives
  // either branch. Dropping it is not a rounding error: a `rgba(183,0,17,0.1)`
  // pill emitted as solid `bg-[#b70011]` is a full-strength crimson badge.
  const mod = alpha < 0.999 ? `/${Math.round(alpha * 100)}` : ''
  return token ? `${prefix}-${token}${mod}` : `${prefix}-[${hex}]${mod}`
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

/**
 * An auto margin the source named, which the measurement cannot show.
 *
 * `getComputedStyle().margin` resolves `auto` to the *used* value, so a
 * `max-w-[1200px] mx-auto` bar reads `margin: 0px` at any viewport narrower than
 * its cap — the centring is exactly zero there and invisible everywhere else.
 * The declaration therefore only exists in the source's class list, and the
 * class has to be emitted from it or the box drifts left the moment the page is
 * rendered wider than the capture.
 *
 * `m-auto` and its axis/side forms are a closed set; a lookbehind on the axis
 * letter keeps `pointer-events-auto` and `w-auto` from matching the way a bare
 * `/auto$/` did.
 */
const SRC_AUTO_MARGIN = /^m[xytblr]?-auto$/

/** A concrete width the source named — reused by the component guard in `emit.ts`. */
export const NAMED_WIDTH = /^w-(\[.+\]|0|px|\d+(?:\.\d+)?)$|^basis-(\[.+\]|\d+)$/

/** Source padding that is already zero, so the base's padding needs no cancel. */
const PAD_ZERO = ['p-0', 'px-0', 'py-0', 'pt-0', 'pr-0', 'pb-0', 'pl-0']

/**
 * Zero padding that cancels a component base which spaces itself with a
 * CSS-variable shorthand.
 *
 * `Card` ships `py-(--card-spacing)`. tailwind-merge pairs a shorthand only when
 * both sides parse as the same class shape, and `py-(--card-spacing)` is not
 * recognised as a `py` utility — so the pair never collapses and the base's
 * value wins on stylesheet order. Forcing is what makes the cancel land; all
 * four sides, because which sides the base pinned is not knowable from the
 * measurement alone.
 */
const PAD_CANCEL = ['px-[0px]!', 'py-[0px]!']

const TRANSPARENT = /^(rgba\(0,\s*0,\s*0,\s*0\)|transparent)$/

/**
 * Size clamps. A box clamped by `max-width` measures *at* the clamp, so without
 * it the emitted node takes its parent's full width instead — source
 * `<p class="max-w-sm">` rendered 442px wide where the source had 384. Initial
 * values (`none`, `auto`, `0px`) say nothing, so they are skipped.
 */
function sizeClamp(style: StyleSubset, component: boolean): string[] {
  const out: string[] = []
  const force = component ? '!' : ''
  const add = (key: keyof StyleSubset, cls: string) => {
    const v = style[key]
    if (!v || v === 'none' || v === 'auto' || nums(v).every((x) => x === 0)) return
    if (v === '100%') out.push(`${cls}-full${force}`)
    else if (nums(v)[0]) out.push(`${cls}-[${nums(v)[0]}px]${force}`)
  }
  add('maxWidth', 'max-w')
  add('minWidth', 'min-w')
  add('maxHeight', 'max-h')
  add('minHeight', 'min-h')
  return out
}

/**
 * A prefix whose rule only applies inside a media query.
 *
 * A capture happens at one viewport, so it can only ever show one branch:
 * at 964px the `lg` rule of `grid-cols-1 lg:grid-cols-12` is inactive and the
 * measured grid encodes the mobile stack. Emitting what was measured alone
 * renders that stack at every width, which is how the hero stayed one column
 * and the page came out twice as tall as its source. The source class list is
 * the only place the other branches exist.
 */
const RESPONSIVE_RE = /^(?:sm|md|lg|xl|2xl):/

/** A utility that sets `display`, the property a single capture sees one branch of. */
const DISPLAY_UTIL = /^(?:flex|grid|block|inline-flex|inline-block|inline|hidden|contents|flow-root|table)$/

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

/** `align-content` only has an effect on a wrapped flex container. */
const CONTENT: Record<string, string> = {
  'flex-start': 'content-start',
  center: 'content-center',
  'flex-end': 'content-end',
  'space-between': 'content-between',
  'space-around': 'content-around',
  'space-evenly': 'content-evenly',
  stretch: 'content-stretch',
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
  /**
   * The measured width is the parent's content width, not a size the page chose.
   *
   * `getComputedStyle().width` resolves `100%` to pixels, so the value in
   * `style.width` can never be the string `'100%'` and the branch below could
   * not fire for any node. Only the caller has both boxes, so only the caller
   * can say this.
   */
  fillsWidth?: boolean
  /**
   * Both horizontal edges are pinned, so `left`/`right` already size the box and
   * a width class would fight them: `left-0 right-0 w-[964px]` pins the width at
   * the capture viewport instead of letting the edges span the parent.
   */
  skipWidth?: boolean
  /**
   * The source element's own class list, the one thing a single capture cannot
   * reconstruct.
   *
   * Only the media-query branches and the grid tracks are read from it (see
   * `RESPONSIVE_RE`), and a branch outranks the measured value by construction:
   * Tailwind emits variant utilities into a later layer, so `lg:grid-cols-12`
   * wins over the measured `grid-cols-[930px]` above 1024px and the measured
   * value still holds below it.
   */
  sourceClasses?: string[]
  /**
   * The node sits in a subtree whose layout changes with the viewport width.
   *
   * Then the measured height is `document`'s state at one width, not the box's
   * size: a one-column hero measures twice what the two-column one does. A node
   * that named its own height keeps it; one that did not is left to the flow,
   * so the height follows the width the page is actually rendered at. Outside
   * such a subtree the measured height is the real one and is always written.
   */
  flowHeight?: boolean
}

/** The Tailwind classes for one node. Ordered layout → box → paint, never sorted blindly. */
export function classNames(style: StyleSubset, opts: ClassOptions = {}): string[] {
  const out: string[] = []

  // What the source said about `display` — `hidden` at capture width beside a
  // `lg:block` that has not fired yet — and about its grid tracks. Both are read
  // before the measured branches because a measured value is one branch of a
  // decision the source spread across breakpoints, and emitting the branch
  // beside the decision is what keeps the other breakpoints alive. Where the
  // source named a display at all, it is emitted instead of the measured one:
  // `hidden md:flex` and `flex` are the same property, and Tailwind orders those
  // rules by class, not by the order they appear in `className`.
  const src = opts.sourceClasses ?? []
  const bare = (c: string) => (RESPONSIVE_RE.test(c) ? c.slice(c.indexOf(':') + 1) : c)
  const srcDisplay = src.filter((c) => DISPLAY_UTIL.test(bare(c)))
  const srcGrid = src.filter((c) => /^[a-z0-9]*:?grid-cols-/.test(bare(c)))
  // `col-span-7` is meaningless without its parent's `lg:grid-cols-12`: one
  // decision split across two elements, and the capture only ever shows one.
  const srcSpan = src.filter((c) => /^col-span-/.test(bare(c)))
  // A ratio is not a capture artefact: `aspect-[4/5]` says the same thing at
  // every width, so it comes through even though it is a size. The measured
  // height beside it is the one branch — a 278px-wide card gives 348px, a
  // 458px-wide one 570px — and freezing that is what stops the image from
  // resizing when the grid gains its columns.
  const srcAspect = src.filter((c) => /^aspect-/.test(bare(c)))
  // A width or flex basis the source varied by breakpoint — `w-full lg:w-80` —
  // where the measured width is the branch in effect at capture. The prefixed
  // one is dropped at capture width and re-applies above it.
  const srcResponsive = src.filter(
    (c) => RESPONSIVE_RE.test(c) && /^(?:w-|h-|min-w-|max-w-|min-h-|max-h-|basis-|flex-|grow|shrink)/.test(bare(c)),
  )

  const srcWrap = style.display === 'flex' && (style.flexWrap === 'wrap' || style.flexWrap === 'wrap-reverse')
  // A height the source itself fixed — `h-[480px]`, `h-96` — is a real size and
  // survives; `h-full` and `h-auto` defer to the flow, so they count as unnamed.
  const srcHeight = src.some((c) => /^h-(?:\[.+\]|\d+(?:\.\d+)?|px|screen)$/.test(bare(c)))
  // A relative height the source named. `getComputedStyle().height` has already
  // resolved `h-full` to pixels, so the `'100%'` branch below cannot fire and the
  // name has to come back from the class list — same defect the width had. An
  // `<img class="w-full h-full">` inside an aspect-ratio box measures 570px at
  // one card width and 348px at another; writing the measurement fixes the image
  // and stops it following its box.
  const srcRelHeight = src.find((c) => !RESPONSIVE_RE.test(c) && /^h-(?:full|auto|screen|svh|lvh|dvh)$/.test(bare(c)))

  const saysFlex = style.display === 'flex' || srcDisplay.some((c) => /flex$/.test(bare(c)))
  if (srcDisplay.length) out.push(...srcDisplay)
  else if (style.display === 'flex') out.push('flex')
  else if (style.display === 'grid') out.push('grid')

  if (saysFlex) {
    // A component's own base may set a column — `Card` ships `flex-col` — and
    // the browser's `row` default only wins when nothing says otherwise. On a
    // component the direction is therefore always stated, or a row of children
    // silently stacks. The measured direction is not emitted beside a source
    // that varied it (`lg:flex-row` is in `srcResponsive`): two rules for one
    // property, and Tailwind's layer order, not this array, picks the winner.
    const srcDir = src.some((c) => RESPONSIVE_RE.test(c) && /^flex-(row|col)/.test(bare(c)))
    if (!srcDir) {
      if (style.flexDirection === 'column') out.push('flex-col')
      else if (style.flexDirection === 'row-reverse') out.push('flex-row-reverse')
      else if (style.flexDirection === 'column-reverse') out.push('flex-col-reverse')
      else if (opts.component) out.push('flex-row')
    }
    // Without this every wrapped row is a single no-wrap line: children keep
    // their width and overflow, or shrink, so a chip row the source wrapped onto
    // two lines renders as one clipped line. `nowrap` is the initial value and
    // says nothing.
    if (srcWrap) {
      out.push(style.flexWrap === 'wrap' ? 'flex-wrap' : 'flex-wrap-reverse')
      // `align-content` only does anything once there is more than one line.
      if (CONTENT[style.alignContent]) out.push(CONTENT[style.alignContent])
    }
  } else if (style.display === 'grid' && !srcDisplay.length) {
    const cols = style.gridTemplateColumns
    // `none` and the no-columns defaults carry no digits; a real track list does.
    if (cols && /\d/.test(cols)) out.push(`grid-cols-[${cols.replace(/\s+/g, '_')}]`)
  } else if (!srcDisplay.length && style.display === 'none') {
    out.push('hidden')
  } else if (!srcDisplay.length && opts.component && (style.display === 'block' || style.display === 'inline-block')) {
    // A component's base states a display of its own — `Button` is `inline-flex`,
    // `Badge` is `inline-flex` — and the browser default for a `<button>` is
    // `inline-block`, so a source block-level control silently became a
    // shrink-wrapped one. Only the two flow values need saying; `flex`, `grid`
    // and `none` are already handled above.
    out.push(style.display)
  }

  // Every breakpoint branch the source named comes through verbatim: this is
  // the whole fix for a page whose layout changes with width, since the capture
  // can only ever contain the branch that was in effect. They sit beside the
  // measured utilities and win where they apply — Tailwind emits variant rules
  // into a later layer than the unprefixed ones.
  out.push(...srcResponsive)

  // A component's base may also state a flow it did not have: `Badge` ships
  // `justify-center`, and a badge the source laid out from the left would centre
  // instead. Where the source says nothing, the component states nothing. A
  // property the source varied by breakpoint is left to the source entirely.
  const srcAlign = src.some((c) => RESPONSIVE_RE.test(c) && /^items-/.test(bare(c)))
  const srcJustify = src.some((c) => RESPONSIVE_RE.test(c) && /^justify-/.test(bare(c)))
  if (saysFlex) {
    if (!srcAlign) {
      if (ALIGN[style.alignItems]) out.push(ALIGN[style.alignItems])
      else if (opts.component) out.push('items-stretch')
    }
    if (!srcJustify) {
      if (JUSTIFY[style.justifyContent]) out.push(JUSTIFY[style.justifyContent])
      else if (opts.component && style.flexDirection !== 'column' && style.flexDirection !== 'column-reverse') out.push('justify-start')
    }
  } else {
    if (!srcAlign && ALIGN[style.alignItems]) out.push(ALIGN[style.alignItems])
    if (!srcJustify && JUSTIFY[style.justifyContent]) out.push(JUSTIFY[style.justifyContent])
  }

  // A span needs the parent's track count to mean anything, so both sides of the
  // decision are emitted from the source rather than from the one measured state.
  out.push(...srcGrid, ...srcSpan, ...srcAspect)

  // A gap is real layout even inside a component: the card's own spacing is the
  // card's, but the distance between two cards is the parent's. A component's
  // base may also carry spacing the source never had — `Card` ships
  // `gap-(--card-spacing)`, 16px between every child, where the source spaced its
  // children with margins. Left alone that is 16px per child of accumulated drift.
  //
  // The cancel has to be `!`-forced. tailwind-merge only pairs a shorthand when
  // *both* sides parse as the same class shape, and `gap-(--card-spacing)` is a
  // CSS-variable shorthand it does not recognise as a `gap` utility at all — so
  // `gap-[0px]` sits harmlessly beside it and the base wins on stylesheet order.
  // `p-0` has the identical problem against `py-(--card-spacing)`. The force is
  // what makes the cancel land; there is no ordering that would.
  const pforce = opts.component ? '!' : ''
  const gap = nums(style.gap)[0]
  if (gap) out.push(`gap-[${gap}px]${pforce}`)
  else if (opts.component) out.push('gap-[0px]!')

  const pad = box('p', style.padding).map((c) => c + pforce)
  const zeroPad = PAD_ZERO.some((c) => src.includes(c))
  out.push(...pad)
  // Only where the source measured no padding of its own — a component already
  // given `py-[6px]` states the correction itself, and the `!` above carries it.
  if (opts.component && pad.length === 0 && !zeroPad) out.push(...PAD_CANCEL)
  // An auto margin the source named is invisible to the measurement (see
  // `SRC_AUTO_MARGIN`), so it enters through the source list. The measured
  // margin is added after it, and `m-0` sits before `mx-auto` so tailwind-merge
  // keeps the source's centring instead of cancelling it on order.
  const autoMargin = src.filter((c) => SRC_AUTO_MARGIN.test(c))
  out.push(...margin(style.margin), ...autoMargin)

  const radius = nums(style.borderRadius)[0]
  if (radius) out.push(radius >= 999 ? 'rounded-full' : `rounded-[${radius}px]`)

  // `border-width` is a per-side shorthand and the sides are not equal: a
  // header with only `border-b` measures `0px 0px 1px`. Taking the first number
  // would read a zero and drop the border entirely, which is how a page whose
  // every divider is a bottom edge came out with none. Conversely a non-uniform
  // shorthand must not be flattened to a plain `border`: that would draw all
  // four sides where the source drew one.
  const bw = nums(style.borderWidth)
  if (bw.length === 1 && bw[0] > 0) {
    out.push(bw[0] === 1 ? 'border' : `border-[${bw[0]}px]`)
  } else if (bw.length > 1) {
    // CSS shorthand expansion, which is not a wrap-around: 3 values are
    // `top right bottom` and the missing left takes the *right*, so reading the
    // last value for every later side drew a left border the source never had.
    const t = bw[0]
    const r = bw.length > 1 ? bw[1] : t
    const b = bw.length > 2 ? bw[2] : t
    const l = bw.length > 3 ? bw[3] : r
    for (const [s, v] of [['t', t], ['r', r], ['b', b], ['l', l]] as const) {
      if (v > 0) out.push(v === 1 ? `border-${s}` : `border-${s}-[${v}px]`)
    }
  }
  if (bw.some((v) => v > 0)) {
    // The base layer paints every border `border-border`, so only a different
    // colour needs saying.
    const line = TRANSPARENT.test(style.borderColor) ? null : toHex(style.borderColor)
    if (line && nearestToken(line, LINE_TOKENS) !== 'border') out.push(paint('border', line, LINE_TOKENS, alphaOf(style.borderColor)))
  } else if (opts.component) {
    // A component's base may draw a border the source never had: `Input` ships
    // `border border-input`, and a plain search field that measured `0px` would
    // come out with a hairline box around it. `border-0` is what cancels it.
    out.push('border-0')
  }

  const bg = TRANSPARENT.test(style.backgroundColor) ? null : toHex(style.backgroundColor)
  if (bg) out.push(paint('bg', bg, BG_TOKENS, alphaOf(style.backgroundColor)))

  if (style.boxShadow && style.boxShadow !== 'none') {
    out.push(`shadow-[${style.boxShadow.replace(/\s+/g, '_')}]`)
  }

  const op = parseFloat(style.opacity)
  if (op && op < 1) out.push(`opacity-${Math.round(op * 100)}`)

  // `clip` is `hidden` without the scroll container, and Tailwind's nearest
  // class is `overflow-clip`. Mapping only `hidden` left every clipped node
  // honouring whatever `overflow` a component's base had already set.
  const ov = overflowClass(style)
  if (ov) out.push(ov)

  if (!opts.skipSize) {
    const w = nums(style.width)[0]
    const h = nums(style.height)[0]
    // `!` on a component's measured size, for the same reason `iconSize` uses
    // it: a variant-prefixed class in the component's base out-specifies a plain
    // utility. `Avatar` ships `data-[size=sm]:size-6`, specificity (0,2,0), and
    // tailwind-merge will not pair its `size-*` group with our `w-*`/`h-*`, so a
    // 28px avatar emitted with `size="sm"` rendered 24px with nothing to say why.
    const force = opts.component ? '!' : ''
    if (opts.skipWidth) {
      // both edges pinned — the offsets are the width
    } else if (opts.fillsWidth) out.push(`w-full${force}`)
    else if (w && (!opts.component || (opts.sourceClasses ?? []).some((c) => NAMED_WIDTH.test(c)))) out.push(`w-[${w}px]${force}`)
    if (srcRelHeight) out.push(srcRelHeight)
    else if (style.height === '100%') out.push(`h-full${force}`)
    // In a breakpoint-varying subtree the measured height is the capture's
    // branch — `h-[950.5px]` is the stacked hero, and the wide layout is half
    // that — so the axis is left to the flow. A node that named its own height
    // (or capped it) keeps it: `min-h-[440px]` is the page's floor at every
    // width, and dropping it would collapse the box.
    else if (h && !(opts.flowHeight && !srcHeight)) out.push(`h-[${h}px]${force}`)
  }

  out.push(...sizeClamp(style, !!opts.component))

  out.push(...positionClasses(style))

  return out
}

/**
 * The type scale: size, weight, leading, colour.
 *
 * Separated from the block/flow classes above because a shadcn component needs
 * these too — its base carries a type scale of its own (`Card` ships `text-sm`,
 * `Button` `text-sm font-medium`) which would otherwise win over the size the
 * source actually measured, leaving every card 14px where the page had 16.
 */
export function typeClasses(style: StyleSubset): string[] {  const out: string[] = []
  const size = nums(style.fontSize)[0]
  if (size) out.push(`text-[${size}px]`)
  if (WEIGHT[style.fontWeight]) out.push(WEIGHT[style.fontWeight])
  // Tracking is part of a text run's width: `uppercase tracking-wider` labels
  // measured 23px wider than the same glyphs at the browser default would be,
  // and dropping it made every such label short. Only a non-zero value: `0px`
  // is the initial and would otherwise clutter every text node.
  const track = nums(style.letterSpacing ?? '')[0]
  if (track) out.push(`tracking-[${track}px]`)
  // Case is a width, not a decoration: `Live Broadcast` set in uppercase at
  // 11px bold measures 102px and the same glyphs in sentence case measure 87.
  // The browser applies `text-transform` before layout, so the IR box already
  // has the uppercased width in it and dropping the property makes the label
  // 15px short of what it measured.
  const tt = style.textTransform
  if (tt === 'uppercase' || tt === 'lowercase' || tt === 'capitalize') out.push(tt)
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
  if (fg) out.push(paint('text', fg, FG_TOKENS, alphaOf(style.color)))
  return out
}

/**
 * The overflow a box measured, as its Tailwind class.
 *
 * `clip` is `hidden` without the scroll container, and Tailwind's nearest class
 * is `overflow-clip`. Mapping only `hidden` left every clipped node honouring
 * whatever `overflow` a component's base had already set. `visible` is the CSS
 * initial and is left out here; only a component's base has anything to cancel,
 * which is what `chromeOverrides` handles.
 */
export function overflowClass(style: StyleSubset): string | null {
  switch (style.overflow) {
    case 'hidden':
      return 'overflow-hidden'
    case 'clip':
      return 'overflow-clip'
    case 'auto':
      return 'overflow-auto'
    case 'scroll':
      return 'overflow-scroll'
    default:
      return null
  }
}

const SIDES = ['top', 'right', 'bottom', 'left'] as const

/**
 * `position` and, for a positioned box, the offsets that actually place it.
 *
 * `absolute` on its own means nothing: without an offset the element keeps the
 * static position it would have had in flow, and without a positioned ancestor
 * it resolves against the page instead of its parent. Both are halves of the
 * same fact and both have to be written, which is why this lives apart from
 * `classNames` — a text leaf is emitted as a `<span>` through `textClasses` and
 * needs the same offsets as any other positioned box.
 */
export function positionClasses(style: StyleSubset): string[] {
  const pos = style.position
  const out: string[] = []
  if (pos === 'absolute') out.push('absolute')
  else if (pos === 'fixed') out.push('fixed')
  else if (pos === 'sticky') out.push('sticky')
  // A containing block is the only reason a `relative` matters, and the base
  // layer has none: leave it out and every absolute child anchors to the page.
  else if (pos === 'relative') out.push('relative')

  const at = (side: (typeof SIDES)[number]) => style[side] ?? 'auto'

  if (pos === 'absolute' || pos === 'fixed') {
    for (const side of SIDES) {
      const v = at(side)
      if (v === 'auto') continue
      const n = nums(v)[0]
      if (n !== undefined) out.push(n === 0 ? `${side}-0` : `${side}-[${n}px]`)
    }
  }

  const z = style.zIndex
  if (z && z !== 'auto' && z !== '0') out.push(`z-[${parseInt(z, 10)}]`)
  return out
}

/**
 * Cancel a component's built-in chrome where the source measured none.
 *
 * A shadcn base class is a *guess* about what a card, badge or button looks
 * like, and it is written as a real class rather than a default: `Card` ships
 * `py-(--card-spacing)` (16px), `ring-1`, `rounded-xl` and `gap-(--card-spacing)`,
 * `Button` ships `px-4 py-2` and a `ring`, `Badge` ships `px-2 py-0.5 rounded-md
 * ring-1`. A source page that measured `padding: 0px`, no ring and a 12px radius
 * gets whatever the base said instead, because "emit nothing" means "leave the
 * base alone" and not "leave this property at its initial value".
 *
 * `cn` is tailwind-merge, so an explicit zero wins over the base per property,
 * which is why the answer is a negation class and not a warning.
 */
export function chromeOverrides(style: StyleSubset): string[] {
  const out: string[] = []
  if (!nums(style.padding).some((x) => x !== 0)) out.push('p-0')
  if (!nums(style.borderRadius).some((x) => x !== 0)) out.push('rounded-none')
  // A ring is a Tailwind-only concept: it draws through a separate box-shadow
  // layer that outlives a plain `shadow-[...]`, so a card whose source drew one
  // soft shadow gains a hard 1px outline unless the layer is explicitly zeroed.
  out.push('ring-0')
  if (!style.boxShadow || style.boxShadow === 'none') out.push('shadow-none')
  if (TRANSPARENT.test(style.backgroundColor)) out.push('bg-transparent')
  // `Card` ships `overflow-hidden`. `visible` is the CSS initial, so this only
  // has anything to cancel on a component, and there it matters: a card the
  // source never clipped silently ate the overlap of anything drawn past it.
  if (style.overflow === 'visible') out.push('overflow-visible')
  // `Button` ships `relative` so its icon slots can be positioned. A source node
  // that is `static` gains a containing block from that base, which re-anchors
  // any absolute descendant it has. `static` is the class that gives it back.
  if (style.position === 'static') out.push('static')
  return out
}

/** Classes that belong to the text run itself, applied to whatever element holds it. */
export function textClasses(style: StyleSubset, opts: ClassOptions = {}): string[] {
  // A text leaf whose source was a flex or grid box — the circular `B` initial,
  // the centred count inside a dot — is not a run laid out by line breaking.
  // Emitted as a bare span it shrink-wraps to the glyphs and loses both its
  // measured box and its centring, which is a 41px circle collapsing to a 12px
  // glyph. The full box path is the one that keeps them. A leaf the source hid
  // at one breakpoint and showed at another belongs there too: `display` says
  // nothing useful for it, and the source's own classes do.
  const src = opts.sourceClasses ?? []
  const srcDisplay = src.filter((c) => {
    const bare = RESPONSIVE_RE.test(c) ? c.slice(c.indexOf(':') + 1) : c
    return DISPLAY_UTIL.test(bare)
  })
  if (style.display === 'flex' || style.display === 'grid' || srcDisplay.length) {
    return [...classNames(style, opts), ...typeClasses(style)]
  }
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
  // A leaf can vary by breakpoint without varying its display — `text-center
  // md:text-left` on the footer note — and the capture holds whichever branch
  // was in effect. The prefixed one is inert at capture width and takes over
  // above it.
  out.push(...src.filter((c) => RESPONSIVE_RE.test(c)))
  out.push(...sizeClamp(style, false))
  out.push(...positionClasses(style))
  // A text run clips for a reason — the one-line ellipsis, the fixed-height
  // label — and this path never reached the overflow rule above.
  const ov = overflowClass(style)
  if (ov) out.push(ov)
  out.push(...typeClasses(style))
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
