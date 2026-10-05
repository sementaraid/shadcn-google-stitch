import type { Classification, IconChild, IconMatch, IR, NodeIR } from '../types.ts'
import { SHADCN } from '../registry/shadcn/index.generated.ts'
import { chromeOverrides, classNames, positionClasses, textClasses, typeClasses, usePalette } from './classname.ts'
import { assignPalette, colorUses, pageBackground } from './colors.ts'

/**
 * IR -> JSX source.
 *
 * ts-morph v28 dropped its JSX factory (`NodeFactory` no longer exists and no
 * generator replaced it), so the tree is written as text here and *parsed* by
 * ts-morph on the way out. Parsing is what keeps this from being string
 * concatenation: M5 finds a node by `data-stitch-id` in the AST and edits it in
 * place, which only works if what we write round-trips through the parser.
 */

export interface EmitResult {
  /** path -> file contents, relative to the project root. */
  files: Map<string, string>
  warnings: string[]
}

const esc = (s: string) =>
  s.replace(/[{}]/g, (c) => `{'${c}'}`).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;')

const pascal = (s: string) =>
  s
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join('')

const kebab = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()

/**
 * One value that differs between the siblings of a repeat group.
 *
 * Slots are keyed by ordinal *and* kind, so a button whose label and variant
 * both change between cards gets two props rather than one being silently kept.
 */
interface Slot {
  key: string
  kind: 'text' | 'class' | 'variant'
  /** Ordinal in depth-first order — the same ordinal in every sibling. */
  index: number
  /** The template node, so the emitter knows which element to switch to a prop. */
  nodeId: string
  /** For `variant`: which prop of the component this slot replaces. */
  prop?: string
  /** One entry per sibling, in sibling order. */
  values: string[]
}

interface RepeatGroup {
  name: string
  firstId: string
  module: string
  slots: Slot[]
  /** How many siblings the group stands for; drives a slotsless `.map()`. */
  count: number
}

interface Ctx {
  ir: IR
  classes: Map<string, Classification>
  /** UI components used while rendering the current module; value is the import path. */
  ui: Map<string, string>
  icons: Set<string>
  warnings: string[]
  /** Keyed by the first sibling's node id: only that one emits the `.map()`. */
  repeats: Map<string, RepeatGroup>
  /** Template node id -> the slots standing in for it (text, class, variant). */
  slots: Map<string, Slot[]>
  usedNames: Set<string>
  /** Node ids inside a subtree whose layout changes with viewport width. */
  varying: Set<string>
}

/** The slot of a given kind on a node, if any. */
function slotOf(ctx: Ctx, id: string, kind: Slot['kind']): Slot | undefined {
  return ctx.slots.get(id)?.find((s) => s.kind === kind)
}

/** Enum props as JSX attributes. Booleans and numbers are not quoted. */
function variantAttrs(cls: Classification, ctx: Ctx): string[] {
  const entry = SHADCN[cls.component!]
  if (!entry) {
    ctx.warnings.push(`${cls.nodeId}: ${cls.component} is not in the registry, emitting as an element`)
    return []
  }

  const slots = ctx.slots.get(cls.nodeId) ?? []
  // Slot props come first: the reconciler drops any value equal to the
  // component's default, so a button that is `outline` while its siblings are
  // default would otherwise lose the attribute entirely.
  const props = new Set([...slots.map((s) => s.prop!), ...Object.keys(cls.variants)])

  return [...props].sort().map((prop) => {
    const slot = slots.find((s) => s.kind === 'variant' && s.prop === prop)
    if (slot) return `${prop}={${slot.key}}`
    const value = cls.variants[prop]
    if (value === undefined) return ''
    if (/^\d+$/.test(value)) return `${prop}={${value}}`
    if (/^(default)?(checked|open|disabled|required|multiple)$/.test(prop)) return `${prop}={true}`
    return `${prop}="${value}"`
  })
}

function stitchAttr(n: NodeIR): string {
  // The verify pass (M5) maps a rendered element back to its IR node through
  // this attribute, so it goes on every element. `import.meta.env.DEV` is not
  // used here: the attribute is inert and Vite strips unknown data-* only if
  // asked, which is a build-config concern, not the emitter's.
  return `data-stitch-id="${n.id}"`
}

/**
 * Widest-wins sizing. Arbitrary value, not `size-N`: the scale is 0.25rem per
 * step, so `size-20` is 80px, not the 20px the box measured.
 */
function iconSize(n: NodeIR): string | null {
  const px = Math.round(Math.max(n.box.w, n.box.h))
  // Important: a component's base can force its descendants — `Badge` ships
  // `[&>svg]:size-3!` — and the size here is the one the source page actually
  // measured, so it has to win over the component's guess.
  return px > 0 ? `size-[${px}px]!` : null
}

function isComponent(n: NodeIR, ctx: Ctx): boolean {
  return Boolean(ctx.classes.get(n.id)?.component)
}

/**
 * A utility that names a concrete width, as opposed to one the layout derives.
 *
 * `min-w-*` and `max-w-*` are deliberately absent: they floor and cap a width
 * without setting one, so `max-w-[1200px] mx-auto` still fills its parent and
 * has to be emitted beside `w-full` or it freezes at whatever the viewport was.
 * Fractions (`w-1/2`) are absent for the same reason — anchored at the end so
 * the numerator alone does not read as a pixel count.
 */
const NAMED_WIDTH = /^w-(\[.+\]|0|px|\d+(?:\.\d+)?)$|^basis-(\[.+\]|\d+)$/

/**
 * A utility that names a concrete height, as opposed to one the content derives.
 *
 * Used only inside a breakpoint-varying subtree (see `breakpointVarying`): there
 * the measured height is one branch and freezing it is the whole bug, so a node
 * that did not name a height leaves the axis to the flow. `min-h`/`max-h` are
 * absent for the same reason as their width twins — they bound without setting.
 */
const NAMED_HEIGHT = /^h-(\[.+\]|0|px|screen|full|auto|\d+(?:\.\d+)?)$/

/**
 * The node ids whose rendered layout depends on the viewport width.
 *
 * A capture happens at one width, so any element whose source carried a
 * breakpoint prefix has branches the capture never saw. Those branches change
 * how big the subtree is — a one-column hero is twice as tall as a two-column
 * one — so a *measured* height inside such a subtree is the capture's branch,
 * not the layout's size, and freezing it makes the page render the narrow
 * layout at every width. Width already has this split (`NAMED_WIDTH` vs
 * derived); height needs it too, but only here: outside these subtrees the
 * measured height is the real one and dropping it would collapse the box.
 *
 * The set is closed upward and downward: an ancestor's size is what its
 * breakpoint-varying descendants made it, and a descendant of such a node may
 * still be inside the varying region.
 */
function breakpointVarying(ir: IR): Set<string> {
  const out = new Set<string>()
  const RESPONSIVE = /^(?:sm|md|lg|xl|2xl):/
  const marked: string[] = []
  for (const id of Object.keys(ir.nodes)) {
    const n = ir.nodes[id]
    if (!n?.visible) continue
    if ((n.classList ?? []).some((c) => RESPONSIVE.test(c))) {
      out.add(id)
      marked.push(id)
    }
  }
  // Up: an ancestor's box is a function of the branches beneath it. Down: the
  // varying region continues into a marked element's own subtree. `descended`
  // is separate from `out` so a node an `up` pass already claimed does not stop
  // the `down` pass from reaching its children.
  const descended = new Set<string>()
  const up = (id: string) => {
    let p = ir.nodes[id]?.parent
    while (p && !out.has(p)) {
      out.add(p)
      p = ir.nodes[p]?.parent
    }
  }
  const down = (id: string) => {
    for (const c of ir.nodes[id]?.children ?? []) {
      if (descended.has(c)) continue
      descended.add(c)
      out.add(c)
      down(c)
    }
  }
  for (const id of marked) {
    up(id)
    down(id)
  }
  return out
}

/**
 * Horizontal edges both pinned — the offsets size the box, no width belongs.
 *
 * Only a positioned box is edged this way; `left`/`right` on a static element
 * are inert, and `positionClasses` emits them for `absolute`/`fixed` alone.
 */
function edgesPinned(n: NodeIR): boolean {
  if (n.style.position !== 'absolute' && n.style.position !== 'fixed') return false
  const pinned = (v: string | undefined) => Boolean(v) && v !== 'auto'
  return pinned(n.style.left) && pinned(n.style.right)
}

/** Every place `classNames` is called, so the source class list is never forgotten. */
function widthOpts(
  n: NodeIR,
  ctx: Ctx,
): { fillsWidth: boolean; skipWidth: boolean; sourceClasses: string[]; flowHeight: boolean } {
  return {
    fillsWidth: fillsWidth(n, ctx),
    skipWidth: edgesPinned(n),
    sourceClasses: n.classList,
    flowHeight: ctx.varying.has(n.id),
  }
}

/**
 * Whether a node's measured width is its parent's content width rather than a
 * size the page asked for.
 *
 * The page's own class list is the truth here, and it is the only thing that
 * separates the two cases — geometry cannot: `max-w-[1200px] mx-auto` measures
 * exactly its parent's content width at a 964px viewport, and so does a
 * `w-full` bar. A node whose source named a width (or a fixed `flex` basis)
 * keeps that name; one that named a relative width, or none at all, is filling.
 *
 * ponytail: only the horizontal axis. Height is left alone because a container
 * that grows to fit its children is indistinguishable from a `h-full` child
 * without the source's own height utility, and guessing wrong there collapses
 * the box. Add it when a fixture shows a stretched child.
 */
function fillsWidth(n: NodeIR, ctx: Ctx): boolean {
  // A text leaf is emitted as a shrink-wrapped `<span>` with the type scale, and
  // `textClasses` never reads the box — a `w-full` on it would be inert.
  if (n.text && !n.children.length) return false
  if (n.classList.some((c) => NAMED_WIDTH.test(c))) return false
  // A pinned box is sized by its edges, not by its parent: with both horizontal
  // edges pinned the offsets *are* the width, so no width class belongs beside
  // them (see `widthOpts`). One edge pinned only means the box shrink-wraps and
  // its measured width is real.
  if (n.style.position === 'absolute' || n.style.position === 'fixed') return false
  const parent = n.parent ? ctx.ir.nodes[n.parent] : null
  if (!parent) return false
  // A grid item is sized by its track, and the track count is what the source
  // varied: the card measured 458px when `md:grid-cols-2` gave two tracks, and
  // the same card is 280px under `lg:grid-cols-4`. Writing the measurement
  // freezes the narrow branch's item width and overflows the wide track.
  if (parent.style.display === 'grid' && parent.classList.some((c) => /grid-cols-/.test(c))) return true
  const edge = (side: 'Left' | 'Right') =>
    (parseFloat(parent.style[`padding${side}`]) || 0) + (parseFloat(parent.style[`border${side}Width`]) || 0)
  const content = parent.box.w - edge('Left') - edge('Right')
  if (Math.abs(n.box.w - content) > 1.5) return false
  const x = parent.box.x + edge('Left')
  return Math.abs(n.box.x - x) <= 1.5
}

/**
 * The classes a node actually carries.
 *
 * One function so the repeat diff and the emitter agree on what "these two
 * siblings differ" means — a diff computed off raw styles would flag props the
 * emitter never writes, and miss ones it does.
 */
function emittedClasses(n: NodeIR, ctx: Ctx): string[] {
  if (isComponent(n, ctx)) {
    // A component states its own flex direction, because its base may already
    // set one — `Card` ships `flex-col`, and a row of children would silently
    // stack without an explicit `flex-row`. Everything else the page measured
    // (padding, border, background, shadow) is emitted too: `cn` is
    // tailwind-merge, so the className a component appends overrides its base
    // per property rather than doubling it.
    //
    // The type scale is the exception that has to be stated explicitly rather
    // than left to a child: `Card` ships `text-sm` and `Button` `text-sm
    // font-medium`, neither of which the source page measured, and the text
    // inside is on child nodes that inherit it. Left alone, every card renders
    // 14px where the page had 16.
    const out = [
      ...classNames(n.style, { component: true, ...widthOpts(n, ctx) }),
      ...chromeOverrides(n.style),
      ...typeClasses(n.style),
    ]
    // A component's base can pin its own descendants at `!important` — `Badge`
    // ships `[&>svg]:size-3!` — and a child's own class cannot out-specify that.
    // Restating the measured size through the same descendant selector on the
    // component does: the component's base comes first in `cn`'s argument list,
    // so Tailwind emits the later rule last. Done here rather than in
    // `classAttrs` because a repeat member's class becomes a slot *value*, and
    // `classAttrs` returns before this point on that path — which is how a
    // repeat-rendered badge kept the 12px base size over the source's 15px.
    const icons = n.children.map((id) => ctx.ir.nodes[id]).filter((c) => c?.visible && c.kind === 'icon')
    const sizes = new Set(icons.map((c) => iconSize(c)))
    if (sizes.size === 1) out.push(`[&>svg]:${[...sizes][0]}`)
    return out
  }
  // A text leaf is styled by the type scale, not by the box model.
  if (n.text && !n.children.length) return textClasses(n.style, { sourceClasses: n.classList })
  // A container that paints its own text — the header bar whose copy sits beside
  // its icons — has to state the type scale too, or the text inherits whatever
  // the nearest ancestor set. That is 33 nodes on one page whose copy rendered
  // at the wrong size, weight and leading while their own box was correct.
  // `classNames` reads the position itself: an absolutely positioned box keeps
  // its measured size only where the source did not pin both edges.
  const opts = widthOpts(n, ctx)
  return n.text ? [...classNames(n.style, opts), ...typeClasses(n.style)] : classNames(n.style, opts)
}

function classAttrs(n: NodeIR, ctx: Ctx): string[] {
  const slot = slotOf(ctx, n.id, 'class')
  if (slot) return [`className={${slot.key}}`]
  const names = emittedClasses(n, ctx)
  return names.length ? [`className="${names.join(' ')}"`] : []
}

function rawSvg(n: NodeIR, ctx: Ctx): string {
  const shape = n.iconShape
  const w = Math.max(1, Math.round(n.box.w))
  const h = Math.max(1, Math.round(n.box.h))

  if (!shape) {
    ctx.warnings.push(`${n.id}: illustration with no captured geometry, emitting an empty box`)
    return `<span ${stitchAttr(n)} className="inline-block w-[${w}px] h-[${h}px]" />`
  }

  const kids = shape.children
    .map(([tag, attrs]: IconChild) => {
      const a = Object.entries(attrs)
        .filter(([k]) => k !== 'class' && k !== 'id' && !k.startsWith('data-'))
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ')
      return `<${tag}${a ? ' ' + a : ''} />`
    })
    .join('')

  const viewBox = shape.viewBox ?? `0 0 ${w} ${h}`
  // A verbatim SVG draws in `currentColor`, so the colour has to be stated or
  // the mark inherits the nearest text colour. A source illustration or brand
  // mark painted white or amber rendered in the page's near-black instead, which
  // is the whole difference for a logo on a dark header.
  const paint = textClasses(n.style).find((c) => /^text-(?!\[[\d.]+px\])/.test(c) && c !== 'text-foreground')
  const attrs = [stitchAttr(n), paint ? `className="${paint}"` : ''].filter(Boolean).join(' ')
  return `<svg ${attrs} width="${w}" height="${h}" viewBox="${viewBox}" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">${kids}</svg>`
}

function iconJsx(n: NodeIR, cls: Classification, ctx: Ctx): string {
  const match: IconMatch | undefined = cls.icon

  // Only the two exact rungs may become an import. A `fuzzy` hit is a ranked
  // guess for a human (or the M6 vision pass) to confirm — emitting it would
  // silently swap the page's artwork for a similar-looking one, which is worse
  // than keeping the geometry. Verified against the pricing fixture: its sparkle
  // scores 0.92 as `Leaf` and is not a Leaf.
  if (!match || match.via === 'none' || (match.via === 'fuzzy' && !n.ligature)) {
    if (match?.via === 'fuzzy' && !n.ligature) {
      ctx.warnings.push(
        `${n.id}: icon looks like ${match.name} (${match.confidence.toFixed(2)}) but was not confirmed; candidates ${match.candidates.slice(0, 5).join(', ')} — kept verbatim`,
      )
    }
    return rawSvg(n, ctx)
  }

  ctx.icons.add(match.name)

  // The icon's own colour, dropped when it is just `foreground` — lucide already
  // strokes `currentColor`, and the base layer sets that to the foreground.
  // Selected as a `text-` class that is *not* a size: `textClasses` also carries
  // `text-[14px]`, and taking the first `text*` match painted the icon's font
  // size on as if it were a colour.
  // An icon-font ligature has no geometry: the element measured the *glyph*, so
  // its own font size is the size and its box width is whatever the font drew.
  // `!` because the surrounding line-height/text utilities would otherwise win.
  const sized = n.ligature
    ? (() => {
        const px = Math.round(parseFloat(n.style.fontSize) || Math.max(n.box.w, n.box.h))
        return px > 0 ? `size-[${px}px]!` : null
      })()
    : iconSize(n)
  const tint = textClasses(n.style).find((c) => /^text-(?!\[[\d.]+px\])/.test(c) && c !== 'text-foreground')
  const classes = [sized, tint].filter(Boolean)
  // The ligature's element is the glyph's own span, and the icon font lays that
  // span out as a block with no case folding of its own. The `<svg>` that
  // replaced it is laid out by the icon component's own base, not by the span's
  // classes, so the two properties that still move it are stated here.
  if (n.ligature) {
    if (n.style.display === 'block') classes.push('block')
    if (n.style.textTransform === 'none') classes.push('normal-case')
    const lh = n.style.lineHeight
    if (lh && lh !== 'normal' && /[\d.]/.test(lh) && !lh.includes('%')) classes.push(`leading-[${lh.replace(/\s+/g, '_')}]`)
    // A positioned ligature — the search field's `absolute left-3` icon — needs
    // its offsets here too, for the same reason.
    classes.push(...positionClasses(n.style, n.classList))
    // Every icon component ships `overflow-hidden` for its own viewBox, which
    // here clips nothing the span did not already clip and shows up as a change
    // against a source node that measured `visible`.
    if (n.style.overflow === 'visible') classes.push('overflow-visible')
  }
  const attrs = [stitchAttr(n)]
  if (classes.length) attrs.push(`className="${classes.join(' ')}"`)

  return `<${match.name} ${attrs.join(' ')} />`
}

function imageJsx(n: NodeIR, ctx: Ctx): string {
  const attrs = [stitchAttr(n), ...classAttrs(n, ctx)]
  if (!slotOf(ctx, n.id, 'class') && n.box.w > 0 && Math.abs(n.box.w / n.box.h - 16 / 9) < 0.15) {
    attrs[attrs.length - 1] = attrs[attrs.length - 1].replace(/"$/, ' aspect-video"')
  }
  return `<ImagePlaceholder ${attrs.join(' ')} />`
}

/**
 * Source tags a text leaf may keep. The source HTML is the truth for what an
 * element *is*: emitting its `<p>`, `<a>`, `<h1>` or `<strong>` as a `<span>`
 * loses the line box, the inline semantics and every attribute the diff would
 * otherwise align on. Only tags that carry text without needing attributes of
 * their own are here — anything else (a `div` that is really a layout wrapper)
 * keeps the neutral span.
 */
const TEXT_TAG = new Set([
  'p', 'span', 'a', 'strong', 'em', 'b', 'i', 'small', 'label', 'li',
  'dt', 'dd', 'figcaption', 'blockquote', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
])

function textJsx(n: NodeIR, ctx: Ctx): string {
  const tag = TEXT_TAG.has(n.tag) ? n.tag : 'span'
  const attrs = [stitchAttr(n)]
  if (tag === 'a' && n.href) attrs.push(`href="${esc(n.href)}"`)
  attrs.push(...classAttrs(n, ctx))
  return `<${tag} ${attrs.join(' ')}>${textInner(n, ctx)}</${tag}>`
}

/** A node's own text and children, in the order the source had them. */
function bodyWithText(n: NodeIR, ctx: Ctx): string {
  const kids = n.children.map((cid) => nodeJsx(ctx.ir.nodes[cid], ctx, {}))
  // When the source ran text *around* an element — `…berlangsung • <span>38 Lot
  // Aktif</span> • Proteksi…` — the flattened `text` loses the span's position
  // and the emitter can only put the whole string on one side of it. The runs
  // list keeps every text gap, so each goes back where it was. Emitted as
  // expressions: a JSX text literal would drop the boundary spaces the runs
  // exist to preserve.
  const runs = n.text ? n.textRuns : null
  if (runs && runs.filter((r) => r.trim()).length > 1) {
    const slot = slotOf(ctx, n.id, 'text')
    let placed = false
    const parts: string[] = []
    const push = (s: string) => {
      if (!s) return
      if (slot) {
        // A slot replaces the node's whole text, so it takes the first gap.
        if (!placed) {
          placed = true
          parts.push(`{${slot.key}}`)
        }
      } else {
        parts.push(`{${JSON.stringify(s)}}`)
      }
    }
    for (let i = 0; i < kids.length; i++) {
      push(runs[i] ?? '')
      parts.push(kids[i])
    }
    push(runs[kids.length] ?? '')
    return parts.join('')
  }
  const text = textInner(n, ctx)
  if (!text) return kids.join('')
  // `textAt` counts element children, so an icon drawn before the label keeps
  // the label after it. A missing index (`null`) means text-only content.
  const at = n.textAt === null ? kids.length : Math.max(0, Math.min(kids.length, n.textAt))
  kids.splice(at, 0, text)
  return kids.join('')
}

/**
 * Source tags a container may keep. The source HTML is the truth for what an
 * element *is*: every `<header>`, `<main>`, `<nav>`, `<footer>`, `<a>` and `<h1>`
 * source had rendered as a `<div>`, so the page was a soup of divs with none of
 * its landmark structure, and the diff had no tag to align on. Tags whose
 * behaviour depends on attributes the IR does not keep (a form's `action`, a
 * table cell's `colspan`, an image's `src`) are deliberately absent and fall
 * back to `div`.
 */
const LANDMARK = new Set([
  'div', 'span', 'header', 'main', 'nav', 'footer', 'section', 'article',
  'aside', 'address', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'blockquote',
  'pre', 'code', 'figure', 'figcaption', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'a', 'strong', 'em', 'b', 'i', 'small', 'label', 'time', 'mark', 'cite',
  'q', 's', 'u', 'sup', 'sub', 'abbr', 'details', 'summary', 'table',
  'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
])

function elementJsx(n: NodeIR, ctx: Ctx, extraAttrs: string[] = [], tag?: string): string {
  const name = tag ?? (LANDMARK.has(n.tag) ? n.tag : 'div')
  const attrs = [stitchAttr(n), ...extraAttrs]
  if (n.ariaLabel) attrs.push(`aria-label="${n.ariaLabel}"`)
  if (name === 'a' && n.href) attrs.push(`href="${esc(n.href)}"`)
  attrs.push(...classAttrs(n, ctx))

  const body = bodyWithText(n, ctx)
  if (!body) return `<${name} ${attrs.join(' ')} />`
  return `<${name} ${attrs.join(' ')}>${body}</${name}>`
}

function componentJsx(n: NodeIR, cls: Classification, ctx: Ctx): string {
  const name = cls.component!
  const entry = SHADCN[name]
  if (!entry) {
    ctx.warnings.push(`${n.id}: ${name} is not a shadcn component; emitting a div instead`)
    return elementJsx(n, ctx)
  }
  ctx.ui.set(name, entry.importPath)

  // A placeholder is the only text an empty field shows, and it survives into the
  // component path too — `Input` takes it as a plain DOM prop.
  const ph = n.placeholder ? [`placeholder="${n.placeholder}"`] : []
  const attrs = [stitchAttr(n), ...ph, ...variantAttrs(cls, ctx), ...classAttrs(n, ctx)].filter(Boolean)

  const body = bodyWithText(n, ctx)
  if (!body) return `<${name} ${attrs.join(' ')} />`
  return `<${name} ${attrs.join(' ')}>${body}</${name}>`
}

/** A node's own text, as a prop reference when it is a slot and as literal text otherwise. */
function textInner(n: NodeIR, ctx: Ctx): string {
  const slot = slotOf(ctx, n.id, 'text')
  if (slot) return `{${slot.key}}`
  return n.text ? esc(n.text) : ''
}

interface Opts {
  /**
   * Render this node as itself, not as the template of a repeat group.
   *
   * The group's component body *is* its template node, so without this the
   * renderer would meet `n.repeat` again and emit the `.map()` inside the very
   * component that map calls — infinite recursion, written out once.
   */
  asTemplate?: boolean
}

function nodeJsx(n: NodeIR, ctx: Ctx, opts: Opts): string {
  if (!n.visible) return ''

  // A collapsed repeat group is emitted once, at its first sibling, as a
  // `.map()` over the sibling data. The other siblings render nothing here
  // because the map already covers them.
  if (n.repeat && !opts.asTemplate) {
    const group = ctx.repeats.get(n.repeat.siblingIds[0])
    if (group) return n.id === group.firstId ? repeatJsx(group) : ''
  }

  const cls = ctx.classes.get(n.id)
  if (cls?.component === 'Icon') return iconJsx(n, cls, ctx)
  if (n.kind === 'illustration') return rawSvg(n, ctx)

  if (n.kind === 'image') return imageJsx(n, ctx)
  if (cls?.component) return componentJsx(n, cls, ctx)

  // An unrecognised control (`<input>`, `<select>`) still renders; keeping the
  // source's element is more faithful than pretending it is a div.
  if (n.kind === 'control') {
    const attrs = [stitchAttr(n)]
    if (n.ariaLabel) attrs.push(`aria-label="${n.ariaLabel}"`)
    // A placeholder is the only text an empty field shows, and the source page
    // shows it — dropping it leaves a visibly blank input in the diff.
    if (n.placeholder) attrs.push(`placeholder="${n.placeholder}"`)
    if (/input|textarea|select/.test(n.tag)) {
      // The border is the source's, not shadcn's: a search field the page drew
      // borderless must not gain a hairline. A browser gives a bare `<input>` a
      // 2px inset ridge, which is not the page's drawing either, so only a real
      // measured line earns a border class.
      const classes = classNames(n.style, { ...widthOpts(n, ctx) })
      if (parseFloat(n.style.borderWidth) > 0) {
        if (n.style.borderStyle !== 'none') classes.push('border-input')
      } else classes.push('border-0')
      if (classes.length) attrs.push(`className="${classes.join(' ')}"`)
      return `<${n.tag} ${attrs.join(' ')} />`
    }
    // A `<button>` is not a void element, and this path met one carrying an icon
    // child — a voice-search button emitted as `<button aria-label="…" />`,
    // which renders as an empty control with the mic silently gone. A control
    // only self-closes when it is really childless. `elementJsx` re-derives the
    // stitch id and aria-label itself, so only the placeholder is passed on.
    if (!n.children.length) return `<${n.tag} ${attrs.join(' ')} />`
    const extra = n.placeholder ? [`placeholder="${n.placeholder}"`] : []
    return elementJsx(n, ctx, extra, n.tag)
  }

  if (n.text && !n.children.length) return textJsx(n, ctx)

  return elementJsx(n, ctx)
}

function repeatJsx(g: RepeatGroup): string {
  if (!g.slots.length) return `{Array.from({ length: ${g.count} }, (_, i) => (<${g.name} key={i} />))}`
  return `{${g.name}Data.map((item, i) => (<${g.name} key={i} {...item} />))}`
}

/**
 * Group the siblings a repeat node stands for into a component with props.
 *
 * Values are compared by ordinal, in depth-first order: repeat detection already
 * proved the siblings share a structure hash, so ordinal `i` in one subtree
 * lines up with ordinal `i` in the next, and each ordinal that holds a differing
 * text, class or variant becomes a prop. This is also what flattens a repeat
 * nested inside a repeat (the pricing fixture's feature lists) — the inner texts
 * become props of the outer component, so no second `.map()` is needed.
 *
 * ponytail: only top-level groups collapse. Add recursive grouping when a
 * fixture needs a repeated component with a second, genuinely different inner
 * `.map()`.
 */
function buildGroup(first: NodeIR, ctx: Ctx): RepeatGroup | null {
  const siblings = first
    .repeat!.siblingIds.map((id) => ctx.ir.nodes[id])
    .filter((n): n is NodeIR => Boolean(n?.visible))
  if (siblings.length < 2) return null

  const rows = siblings.map((s) => walkOrdered(s, ctx))
  const template = rows[0]
  if (rows.some((r) => r.length !== template.length)) return null

  const slots: Slot[] = []
  const counters = { text: 0, class: 0, variant: 0 }

  for (let i = 0; i < template.length; i++) {
    const add = (kind: Slot['kind'], values: string[], prop?: string) => {
      const key = `${kind}${counters[kind]++}`
      slots.push({ key, kind, index: i, nodeId: template[i].id, prop, values })
    }

    if (varying(rows.map((r) => r[i].text))) add('text', rows.map((r) => r[i].text))
    if (varying(rows.map((r) => r[i].cls))) add('class', rows.map((r) => r[i].cls))

    // A component's variant is invisible in both text and className, so it is
    // compared on its own: the pricing fixture's Pro and Team buttons are filled
    // while Starter's is outlined, which is the difference a reader would notice.
    const node = template[i].node
    const own = ctx.classes.get(node.id)?.variants ?? {}
    for (const prop of Object.keys(own).sort()) {
      const values = rows.map((r) => effectiveVariant(r[i].node!, prop, ctx))
      if (varying(values)) add('variant', values, prop)
    }
  }

  // Filled in by `emit`, which is where the name has to be unique project-wide.
  return { name: groupName(first, ctx), firstId: first.id, module: '', slots, count: siblings.length }
}

const varying = (values: string[]): boolean => new Set(values).size > 1

/**
 * A node's value for one variant prop, with the registry default filled in.
 *
 * `reconcile` drops props equal to the component's default, which is right for
 * a one-off but wrong for a repeat slot: three cards whose buttons are default,
 * default, outline would compare as `undefined, undefined, outline` and read as
 * two distinct values when they are really just two.
 */
function effectiveVariant(n: NodeIR, prop: string, ctx: Ctx): string {
  const own = ctx.classes.get(n.id)?.variants?.[prop]
  if (own !== undefined) return own
  const axis = SHADCN[ctx.classes.get(n.id)?.component ?? '']?.variants?.find((v) => v.prop === prop)
  return axis?.default ?? ''
}

/** A subtree's text, classes and nodes, in the depth-first order the emitter renders them. */
function walkOrdered(root: NodeIR, ctx: Ctx): Array<{ id: string; text: string; cls: string; node: NodeIR }> {
  const out: Array<{ id: string; text: string; cls: string; node: NodeIR }> = []
  const walk = (n: NodeIR) => {
    if (!n.visible) return
    out.push({ id: n.id, text: n.text ?? '', cls: emittedClasses(n, ctx).join(' '), node: n })
    for (const cid of n.children) {
      const c = ctx.ir.nodes[cid]
      if (c) walk(c)
    }
  }
  walk(root)
  return out
}

function groupName(n: NodeIR, ctx: Ctx): string {
  const base = ctx.classes.get(n.id)?.component ?? TAG_NAMES[n.tag] ?? pascal(n.tag)
  const root = `Repeat${base}`
  let name = root
  let i = 1
  while (ctx.usedNames.has(name)) name = `${root}${i++}`
  ctx.usedNames.add(name)
  return name
}

const TAG_NAMES: Record<string, string> = {
  li: 'Item',
  div: 'Item',
  span: 'Item',
  a: 'Link',
  button: 'Button',
  td: 'Cell',
  tr: 'Row',
  option: 'Option',
}

export function emit(ir: IR, classes: Map<string, Classification>): EmitResult {
  const ctx: Ctx = {
    ir,
    classes,
    ui: new Map(),
    icons: new Set(),
    warnings: [],
    repeats: new Map(),
    slots: new Map(),
    usedNames: new Set(),
    varying: breakpointVarying(ir),
  }

  // The class emitter resolves colours against this palette, so it has to be set
  // before the first `classNames` call. Same palette the stylesheet is written
  // from — one extraction, two consumers.
  usePalette(assignPalette(pageBackground(ir), colorUses(ir, pageBackground(ir))))

  const body = Object.values(ir.nodes).find((n) => n.tag === 'body')
  if (!body) throw new Error('no <body> in the IR — the page did not render')

  const roots = body.children.map((cid) => ir.nodes[cid]).filter((n) => n?.visible)
  if (roots.length === 0) throw new Error('the page rendered no visible content')

  const files = new Map<string, string>()

  // Repeat components are rendered *before* the page, and each one's imports are
  // captured and cleared in between: a `Card` only a repeat component uses must
  // be imported by that file, not by the page that merely maps over it.
  for (const n of Object.values(ir.nodes)) {
    if (!n.repeat || !n.visible || n.repeat.siblingIds[0] !== n.id) continue
    if (hasRepeatAncestor(n, ir)) continue

    const group = buildGroup(n, ctx)
    if (!group) continue
    group.module = kebab(group.name)

    ctx.repeats.set(n.id, group)
    for (const s of group.slots) ctx.slots.set(s.nodeId, [...(ctx.slots.get(s.nodeId) ?? []), s])

    const jsx = nodeJsx(n, ctx, { asTemplate: true })
    const imports = takeImports(ctx)
    files.set(`src/components/generated/${group.module}.tsx`, repeatModule(group, jsx, imports, ctx))
  }

  const tree = roots.map((n) => nodeJsx(n, ctx, {})).filter(Boolean).join('\n      ')

  const groups = [...ctx.repeats.values()]
  const data = groups
    .filter((g) => g.slots.length)
    .map((g) => `\nconst ${g.name}Data = [\n${repeatRows(g, ctx)}\n] as const\n`)
    .join('')

  const pageBody = `export function Page() {
  return (
    <div className="min-h-screen bg-background" data-stitch-root>
      ${tree}
    </div>
  )
}
`

  const imports = takeImports(ctx)
  // The props interface is exported for whoever extends the component later, not
  // for the page that maps over it, so only the value is imported here.
  const local = groups.map((g) => `import { ${g.name} } from './${g.module}'`)

  files.set(
    'src/components/generated/page.tsx',
    module([...imports.uiLines, ...local], imports.icons, data + '\n' + pageBody),
  )

  files.set(
    'src/App.tsx',
    `import { Page } from '@/components/generated/page'

export default function App() {
  return <Page />
}
`,
  )

  files.set('src/components/generated/image-placeholder.tsx', IMAGE_PLACEHOLDER)

  return { files, warnings: ctx.warnings }
}

/**
 * Whether this repeat node sits inside another one's collapsed subtree.
 *
 * Any ancestor carrying a `repeat` counts, not just the group's first sibling:
 * the pricing fixture's feature lists hang off the *second* and *third* card,
 * so checking only for a first-sibling ancestor misses them and emits a stray
 * component for each.
 */
function hasRepeatAncestor(n: NodeIR, ir: IR): boolean {
  let cur = n.parent ? ir.nodes[n.parent] : null
  while (cur) {
    if (cur.repeat) return true
    cur = cur.parent ? ir.nodes[cur.parent] : null
  }
  return false
}

interface Imports {
  uiLines: string[]
  icons: string[]
}

/** Claim the imports accumulated so far, so the next module starts clean. */
function takeImports(ctx: Ctx): Imports {
  const uiLines = [...ctx.ui].sort().map(([name, path]) => `import { ${name} } from '${path}'`)
  const icons = [...ctx.icons].sort()
  ctx.ui.clear()
  ctx.icons.clear()
  return { uiLines, icons }
}

function module(imports: string[], icons: string[], body: string): string {
  const lines = [...imports]
  if (icons.length) lines.push(`import { ${icons.join(', ')} } from 'lucide-react'`)
  if (body.includes('ImagePlaceholder')) lines.push(`import { ImagePlaceholder } from './image-placeholder'`)
  return lines.length ? `${lines.join('\n')}\n\n${body}` : body
}

/** The data rows that sit beside the map site, one per sibling. */
function repeatRows(g: RepeatGroup, ctx: Ctx): string {
  // Slot values are already one-per-visible-sibling, so they are the row count.
  const count = g.slots[0]?.values.length ?? ctx.ir.nodes[g.firstId].repeat?.count ?? 0
  return Array.from({ length: count }, (_, i) => {
    const fields = g.slots.map((s) => `${s.key}: ${JSON.stringify(s.values[i] ?? '')}`)
    return `  { ${fields.join(', ')} },`
  }).join('\n')
}

/**
 * The declared type of one prop slot.
 *
 * A variant slot feeds a component prop, so its type is that component's own
 * union from the vendored registry — `"secondary" | "outline"`, not `string`.
 * Emitting `string` there does not compile: `<Badge variant={variant0}>` with
 * `variant0: string` is TS2322. Text and class slots are genuinely free-form.
 */
function slotType(s: Slot, ctx: Ctx): string {
  if (s.kind !== 'variant' || !s.prop) return 'string'
  const component = ctx.classes.get(s.nodeId)?.component
  const axis = component ? SHADCN[component]?.variants.find((v) => v.prop === s.prop) : undefined
  if (!axis?.options.length) return 'string'
  return axis.options.map((o) => JSON.stringify(o)).join(' | ')
}

function repeatModule(g: RepeatGroup, jsx: string, imports: Imports, ctx: Ctx): string {
  const iface = g.slots.length
    ? `export interface ${g.name}Props {\n${g.slots.map((s) => `  ${s.key}: ${slotType(s, ctx)}`).join('\n')}\n}\n\n`
    : ''

  const signature = g.slots.length ? `{ ${g.slots.map((s) => s.key).join(', ')} }: ${g.name}Props` : ''

  const body = `export function ${g.name}(${signature}) {
  return (${jsx})
}
`

  return module(imports.uiLines, imports.icons, iface + body)
}

const IMAGE_PLACEHOLDER = `import type { ComponentProps } from 'react'
import { ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Every \`img\`, \`<picture>\` and \`background-image\` in the source becomes one of
 * these. Dimensions are preserved so the layout still measures true; the original
 * \`src\` rides along in \`data-src\` for whoever fills it in later.
 *
 * The verify pass masks this region: chasing a picture that was never going to
 * match would burn the patch loop.
 *
 * \`...props\` is not decoration: the emitter puts \`data-stitch-id\` on this element
 * and the verify pass finds every region through that attribute. Swallowing it
 * made each image read as "not present in render" and score 0 — on an image-heavy
 * page that is most of the weight.
 */
export function ImagePlaceholder({
  className,
  src,
  ...props
}: ComponentProps<'div'> & { src?: string }) {
  return (
    <div
      data-placeholder
      data-src={src}
      {...props}
      className={cn('grid place-items-center bg-muted text-muted-foreground', className)}
    >
      <ImageIcon className="size-6 opacity-40" />
    </div>
  )
}
`
