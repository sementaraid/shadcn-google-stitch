import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { ICON_FONT, type FontUsage, type IR, type IconShape, type NodeIR, type RepeatInfo } from './types.ts'
import type { Ingested } from './ingest.ts'
import { canonicalName, toPascal } from './classify/icon.ts'
import { all as allCssProperties } from 'known-css-properties'

/**
 * Every CSS property name the platform defines, from `known-css-properties`
 * (generated from the MDN data). Passed to `getComputedStyle.getPropertyValue`,
 * which is case-insensitive and ignores the vendor-prefixed entries this engine
 * does not implement, so a superset costs nothing but a dictionary lookup each.
 *
 * The list is deliberately NOT hand-picked. A fixed 27-property list cannot hold
 * `top`/`right`/`bottom`, per-side border widths, `max-width` or `white-space`,
 * and a node positioned by one of those rendered in the wrong place with nothing
 * in the IR to reconstruct it from.
 */
export const STYLE_PROPS: readonly string[] = allCssProperties

/**
 * Recorded even at their initial value. These are the properties every consumer
 * reads unconditionally (`nums(style.padding)`), so a missing key would be a
 * crash rather than an absent style; the rest of the record stays sparse.
 */
export const CORE_STYLE_PROPS = [
  'display', 'position', 'flex-direction', 'align-items', 'justify-content', 'gap',
  'width', 'height', 'padding', 'margin', 'border-radius', 'border-width',
  'border-color', 'border-style', 'background-color', 'color', 'font-size',
  'font-weight', 'font-family', 'line-height', 'letter-spacing', 'box-shadow',
  'opacity', 'overflow', 'cursor', 'z-index', 'grid-template-columns',
  'top', 'right', 'bottom', 'left', 'max-width', 'min-width', 'max-height', 'min-height',
  'flex-wrap', 'white-space', 'text-align', 'text-transform', 'text-overflow',
] as const

type RawNode = Omit<NodeIR, 'repeat' | 'cropPath' | 'ligature'>
type WalkedNode = RawNode & { iconShape: IconShape | null }

/**
 * Material Symbols names that do not Pascal-case into a Lucide export. Only the
 * ones with an honest counterpart are listed; anything absent falls through to
 * the Lucide ladder, and if that misses too the node stays a literal word rather
 * than becoming a wrong icon.
 */
const LIGATURE_ALIAS: Record<string, string> = {
  workspace_premium: 'Award',
  award_star: 'Award',
  location_on: 'MapPin',
  east: 'ArrowRight',
  arrow_forward: 'ArrowRight',
  notifications: 'Bell',
  videocam: 'Video',
  straighten: 'Ruler',
  shopping_cart_checkout: 'ShoppingCart',
  local_shipping: 'Truck',
  expand_more: 'ChevronDown',
  alarm: 'AlarmClock',
  local_fire_department: 'Flame',
  verified_user: 'ShieldCheck',
}

/**
 * An icon font paints a glyph by *name*: the source markup says
 * `<span class="material-symbols-outlined">gavel</span>` and the font turns that
 * word into a drawing. Nothing else in the pipeline can tell, because the DOM
 * reports a text node — so these walk through the page as `text`, get emitted as
 * the literal word `gavel`, and the browser renders that word in a font it does
 * not have. The damage is not only the glyph: a 14px box holding eight letters
 * is 36px wide in flow, which shoves every sibling in the row.
 *
 * Promotion to `icon` puts them back on the Lucide ladder, where the emitter
 * already knows how to size, tint and import a glyph.
 */
export function promoteLigatureIcons(nodes: Record<string, NodeIR>): number {
  let promoted = 0
  for (const n of Object.values(nodes)) {
    if (n.kind !== 'text' || n.children.length > 0) continue
    if (!ICON_FONT.test(n.style.fontFamily)) continue
    const word = (n.text ?? '').trim()
    if (!/^[a-z][a-z0-9_]{2,30}$/.test(word)) continue
    // `toPascal` splits on `-` (the Lucide spelling); ligature names are
    // `snake_case`, so `chevron_right` would otherwise look up `Chevron_right`.
    const name = LIGATURE_ALIAS[word] ?? canonicalName(toPascal(word.replace(/_/g, '-')))
    if (!name) continue
    n.kind = 'icon'
    n.ligature = name
    promoted++
  }
  return promoted
}

interface WalkResult {
  nodes: WalkedNode[]
  rootId: string
  colors: IR['colors']
  fonts: FontUsage[]
  usedProps: string[]
}

const WALKER_SRC = fileURLToPath(new URL('./walker.browser.js', import.meta.url))

let walkerFn: string | null = null

async function loadWalker(): Promise<string> {
  // The DOM walk happens in one page.evaluate: crossing the CDP boundary per
  // node would be thousands of round-trips. The source is read as text rather
  // than imported because a transpiled bundle leaks helpers (__name) that do
  // not exist in the browser context.
  if (walkerFn === null) {
    const src = await readFile(WALKER_SRC, 'utf8')
    walkerFn = `(() => { ${src}\nreturn walkPage(${JSON.stringify(STYLE_PROPS)}, ${JSON.stringify(CORE_STYLE_PROPS)}); })()`
  }
  return walkerFn
}

/**
 * Width is bucketed to 16px and height ignored: siblings in a flex row share a
 * height but their widths differ by whatever text they contain, so exact
 * geometry would keep a card list from ever grouping into one `.map()`.
 */
const bucket = (px: number) => Math.round(px / 16)

/**
 * Two DOM subtrees are "the same component repeated" when they line up after
 * text is blanked out. Text must be blanked, otherwise six cards with different
 * copy read as six unrelated structures and never become a `.map()`.
 */
export function detectRepeats(nodes: Record<string, NodeIR>): void {
  const shape = new Map<string, string[]>()

  const hash = (id: string): string => {
    const n = nodes[id]
    if (!n) return ''
    // Text is deliberately absent, and children are sorted so reordered markup
    // still hashes the same.
    const kids = n.children.map(hash).sort().join(',')
    return `${n.tag}|${n.style.display}|${n.style.flexDirection}|w${bucket(n.box.w)}|[${kids}]`
  }

  for (const n of Object.values(nodes)) {
    if (!n.visible || n.isLeafOpaque) continue
    const key = hash(n.id)
    if (!key) continue
    const bucket = shape.get(key) ?? []
    bucket.push(n.id)
    shape.set(key, bucket)
  }

  for (const ids of shape.values()) {
    if (ids.length < 2) continue
    // Only group siblings: a shape recurring under two unrelated parents is a
    // coincidence, not a list.
    const byParent = new Map<string, string[]>()
    for (const id of ids) {
      const p = nodes[id].parent ?? '__root__'
      const arr = byParent.get(p) ?? []
      arr.push(id)
      byParent.set(p, arr)
    }
    for (const [parent, group] of byParent) {
      if (group.length < 2) continue
      // A repeat emits its template once and `.map()`s the copies, so the group has
      // to be run of *adjacent* siblings. Two buttons that bucket to the same width
      // with an unrelated sibling between them are not a list, and emitting them as
      // one would move the middle sibling out of the row it belongs to.
      const parentNode = nodes[parent]
      const order = parentNode ? parentNode.children : group
      const runs: string[][] = []
      for (const id of [...group].sort((a, b) => order.indexOf(a) - order.indexOf(b))) {
        const run = runs[runs.length - 1]
        if (run && order.indexOf(id) === order.indexOf(run[run.length - 1]) + 1) run.push(id)
        else runs.push([id])
      }
      for (const run of runs) {
        if (run.length < 2) continue
        const info: RepeatInfo = { count: run.length, siblingIds: [...run].sort() }
        for (const id of run) nodes[id].repeat = info
      }
    }
  }
}

export async function extract(ing: Ingested): Promise<IR> {
  const script = await loadWalker()
  const { nodes: raw, rootId, colors, fonts, usedProps } = (await ing.page.evaluate(script)) as WalkResult

  const nodes: Record<string, NodeIR> = {}
  for (const n of raw) {
    nodes[n.id] = { ...n, repeat: null, ligature: null, cropPath: null, textAt: n.text && (n.textAt ?? -1) >= 0 ? n.textAt : null, textRuns: n.text ? (n.textRuns ?? null) : null }
  }

  // Before repeat detection: a promoted ligature changes the node's identity, and
  // two sibling rows that were "the same because both hold the word `gavel`" stay
  // the same only if the promotion happened first.
  promoteLigatureIcons(nodes)
  detectRepeats(nodes)

  // Fonts drive the `--font-*` assignment later, so rank by how much text each
  // family actually renders rather than by first appearance.
  const used = new Set(fonts.map((f) => f.family))
  const fontSubstituted = ing.fontSubstituted.filter((f) => used.has(f))

  return {
    source: { html: '', screenshot: ing.screenshot },
    viewport: ing.viewport,
    colors: [...colors].sort((a, b) => b.area - a.area).slice(0, 64),
    fonts: [...fonts].sort((a, b) => b.count - a.count),
    fontSubstituted,
    usedProps,
    nodes,
    root: rootId,
  }
}
