import type { Candidate, Classification, IR, NodeIR } from '../types.ts'
import { SIGNATURES } from './signatures.ts'
import { matchIcon } from './icon.ts'
import { reconcile } from './variants.ts'
import { kids, type Ctx, type Signature } from './signature.ts'
import { pageBackground as pageBackgroundOf } from '../codegen/theme.ts'

/** The page background as a computed `rgb()` string, which is what IR styles hold. */
function toCss(hex: string): string {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

export const AUTO_ACCEPT = 0.8
export const AMBIGUOUS = 0.5

/** Ancestors that describe the page, not a component. Never worth classifying. */
const STRUCTURAL = new Set(['html', 'body', 'head', 'script', 'style', 'link', 'meta'])

function score(n: NodeIR, sig: Signature, ctx: Ctx): Candidate | null {
  if (sig.requires && !sig.requires(n, ctx)) return null

  const entries = Object.entries(sig.weight)
  const total = (sig.base ?? 0) + entries.reduce((sum, [, fn]) => sum + fn(n, ctx), 0)

  const evidence: string[] = []
  for (const [key, fn] of entries) {
    const v = fn(n, ctx)
    if (v >= 0.99) evidence.push(key)
  }

  const variants: Record<string, string> = {}
  for (const [key, fn] of Object.entries(sig.variants ?? {})) {
    const v = fn(n, ctx)
    if (v !== null) variants[key] = v
  }

  return { name: sig.name, score: total / entries.length, variants, evidence }
}

/**
 * A wrapper holding several finished components is a layout region, not a
 * component. Without this, every `<section>` that happens to have a border and
 * two children reads as a Card, and any row of medium-weight labels reads as a
 * Tabs. Icons are excluded: a decorative glyph is not a child component.
 *
 * Runs before `suppressNested`, which then only has to resolve the genuine case
 * of a node duplicated by its own inner content box.
 */
function demoteLayoutContainers(candidates: Map<string, Candidate[]>, nodes: Record<string, NodeIR>): Set<string> {
  const demoted = new Set<string>()

  for (const [id, list] of candidates) {
    const childComponents = nodes[id].children.filter((cid) => {
      const best = candidates.get(cid)?.[0]
      return best && best.score >= AUTO_ACCEPT && best.name !== 'Icon'
    })
    if (childComponents.length < 2) continue

    demoted.add(id)
    for (const c of list) c.score = Math.min(c.score, AMBIGUOUS - 0.01)
  }

  return demoted
}

/**
 * Containment resolution. A card's inner wrapper often satisfies the Card
 * signals too (same border, same radius), so when a node and its ancestor both
 * claim the same component, only the outer one is real — the inner is the
 * card's own content box.
 */
function suppressNested(candidates: Map<string, Candidate[]>, nodes: Record<string, NodeIR>): void {
  for (const [id, list] of candidates) {
    const accepted = list.filter((c) => c.score >= AUTO_ACCEPT)
    if (accepted.length === 0) continue

    let ancestor = nodes[id].parent
    while (ancestor) {
      const parentList = candidates.get(ancestor)
      const clash = parentList?.find(
        (c) => c.score >= AUTO_ACCEPT && accepted.some((a) => a.name === c.name),
      )
      if (clash) {
        // The ancestor won; demote this node below the accept line.
        for (const c of list) if (c.name === clash.name) c.score = Math.min(c.score, AMBIGUOUS - 0.01)
      }
      ancestor = nodes[ancestor].parent
    }
  }
}

export function classify(ir: IR): Map<string, Classification> {
  // The modal background, so "is this element filled" can be answered against
  // the page rather than against transparency alone.
  const pageBackground = toCss(pageBackgroundOf(ir))
  const ctx: Ctx = { nodes: ir.nodes, pageBackground }
  const out = new Map<string, Classification>()

  const candidates = new Map<string, Candidate[]>()

  for (const n of Object.values(ir.nodes)) {
    if (STRUCTURAL.has(n.tag)) continue

    // An icon-font ligature carries no geometry to match against, so its name was
    // resolved at extract time and only its classification is left to do here.
    if (n.kind === 'icon' && n.ligature) {
      out.set(n.id, {
        nodeId: n.id,
        component: 'Icon',
        score: 1,
        variants: {},
        evidence: ['ligature'],
        candidates: [],
        icon: { via: 'ligature', name: n.ligature, confidence: 1 },
      })
      continue
    }

    if (n.kind === 'icon' && n.iconShape) {
      out.set(n.id, {
        nodeId: n.id,
        component: 'Icon',
        score: 1,
        variants: {},
        evidence: ['svg'],
        candidates: [],
        icon: matchIcon(n.iconShape),
      })
      continue
    }

    // Native form elements and illustrations already have a decided identity.
    if (n.kind === 'illustration' || n.kind === 'image') continue

    if (!n.visible) continue

    const scored = SIGNATURES.map((sig) => score(n, sig, ctx))
      .filter((c): c is Candidate => c !== null)
      .sort((a, b) => b.score - a.score)

    if (scored.length) candidates.set(n.id, scored)
  }

  const demoted = demoteLayoutContainers(candidates, ir.nodes)
  suppressNested(candidates, ir.nodes)

  for (const [id, scored] of candidates) {
    const best = scored[0]
    const component = best.score >= AUTO_ACCEPT ? best.name : null
    // A demoted wrapper keeps its evidence but reports no component: it is part
    // of the output tree, just not a component boundary.
    const evidence = demoted.has(id) ? [...best.evidence, 'layout-region'] : best.evidence

    // Filter against the vendored props before this leaves the classifier: a
    // signature's proposal is a hypothesis about what it saw, and only the
    // registry knows whether shadcn can express it.
    const { attrs, state, dropped } = component
      ? reconcile(component, best.variants)
      : { attrs: {}, state: {}, dropped: [] }

    out.set(id, {
      nodeId: id,
      component,
      score: best.score,
      // One field for everything the emitter may write: enum props and observed
      // state both become JSX attributes.
      variants: { ...attrs, ...state },
      evidence: dropped.length ? [...evidence, ...dropped.map((d) => `dropped:${d}`)] : evidence,
      candidates: scored.slice(0, 3),
    })
  }

  return out
}

/**
 * Descendants of an accepted component. A `td` scoring 0.77 on Badge is not a
 * missed badge — it is a cell inside a Table that was already recognised, and
 * the emitter renders it as Table content. Asking the LLM about these would
 * flood the queue with the interior of every composite on the page.
 */
export function interiorOf(nodes: Record<string, NodeIR>, classes: Map<string, Classification>): Set<string> {
  const interior = new Set<string>()

  for (const [id, c] of classes) {
    if (!c.component || c.component === 'Icon') continue
    const stack = [...nodes[id].children]
    while (stack.length) {
      const cur = stack.pop()!
      // Stop at a nested component boundary: a Button inside a Card is its own
      // component, and anything inside that button belongs to the button.
      const inner = classes.get(cur)
      if (inner?.component) continue
      interior.add(cur)
      stack.push(...nodes[cur].children)
    }
  }

  return interior
}

/** Nodes the LLM pass should look at: genuinely undecided, not composite interior. */
export function ambiguous(classes: Map<string, Classification>, interior: Set<string>): Classification[] {
  return [...classes.values()]
    .filter((c) => c.component === null && c.score >= AMBIGUOUS && !interior.has(c.nodeId))
    .sort((a, b) => b.score - a.score)
}

export interface ClassifyStats {
  total: number
  accepted: number
  ambiguous: number
  unclassified: number
  icons: number
  byComponent: Record<string, number>
}

export function stats(classes: Map<string, Classification>, ir: IR, interior: Set<string>): ClassifyStats {
  let accepted = 0
  let amb = 0
  let icons = 0
  const byComponent: Record<string, number> = {}

  for (const c of classes.values()) {
    if (c.component === 'Icon') icons++
    else if (c.component) {
      accepted++
      byComponent[c.component] = (byComponent[c.component] ?? 0) + 1
    } else if (c.score >= AMBIGUOUS && !interior.has(c.nodeId)) {
      // Composite interior is undecided by design, not an open question.
      amb++
    }
  }

  return {
    total: Object.values(ir.nodes).filter((n) => n.visible && !STRUCTURAL.has(n.tag)).length,
    accepted,
    ambiguous: amb,
    unclassified: 0,
    icons,
    byComponent,
  }
}
