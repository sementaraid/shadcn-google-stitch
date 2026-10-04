import type { Classification, IconChild, IconMatch, IR, NodeIR } from '../types.ts'
import { SHADCN } from '../registry/shadcn/index.generated.ts'
import { classNames, textClasses, usePalette } from './classname.ts'
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
    return classNames(n.style, { component: true })
  }
  // A text leaf is styled by the type scale, not by the box model.
  if (n.text && !n.children.length) return textClasses(n.style)
  // An absolutely positioned node carries its own offsets, not a flow size.
  return classNames(n.style, { skipSize: n.style.position === 'absolute' })
}

function classAttrs(n: NodeIR, ctx: Ctx): string[] {
  const slot = slotOf(ctx, n.id, 'class')
  if (slot) return [`className={${slot.key}}`]
  const names = emittedClasses(n, ctx)
  // A component's base can pin its own descendants at `!important` — `Badge`
  // ships `[&>svg]:size-3!` — and a child's own class cannot out-specify that.
  // Restating the measured size as the same descendant selector on the component
  // does, because the component's base comes first in `cn`'s argument list and
  // Tailwind emits the later rule last.
  const icons = n.children.map((id) => ctx.ir.nodes[id]).filter((c) => c?.visible && c.kind === 'icon')
  const sizes = new Set(icons.map((c) => iconSize(c)))
  if (isComponent(n, ctx) && sizes.size === 1) names.push(`[&>svg]:${[...sizes][0]}`)
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
  return `<svg ${stitchAttr(n)} width="${w}" height="${h}" viewBox="${viewBox}" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">${kids}</svg>`
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

function textJsx(n: NodeIR, ctx: Ctx): string {
  const attrs = [stitchAttr(n), ...classAttrs(n, ctx)]
  return `<span ${attrs.join(' ')}>${textInner(n, ctx)}</span>`
}

/** A node's own text and children, in the order the source had them. */
function bodyWithText(n: NodeIR, ctx: Ctx): string {
  const kids = n.children.map((cid) => nodeJsx(ctx.ir.nodes[cid], ctx, {}))
  const text = textInner(n, ctx)
  if (!text) return kids.join('')
  // `textAt` counts element children, so an icon drawn before the label keeps
  // the label after it. A missing index (`null`) means text-only content.
  const at = n.textAt === null ? kids.length : Math.max(0, Math.min(kids.length, n.textAt))
  kids.splice(at, 0, text)
  return kids.join('')
}

function elementJsx(n: NodeIR, ctx: Ctx): string {
  const attrs = [stitchAttr(n)]
  if (n.ariaLabel) attrs.push(`aria-label="${n.ariaLabel}"`)
  attrs.push(...classAttrs(n, ctx))

  const body = bodyWithText(n, ctx)
  if (!body) return `<div ${attrs.join(' ')} />`
  return `<div ${attrs.join(' ')}>${body}</div>`
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
    if (/input|textarea|select/.test(n.tag)) attrs.push('className="border border-input"')
    return `<${n.tag} ${attrs.join(' ')} />`
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
