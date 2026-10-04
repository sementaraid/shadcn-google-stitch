import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import type { Box, IR, NodeIR } from '../types.ts'

/**
 * How the rendered page scores against the reference, region by region.
 *
 * Per-region rather than a single number: a global 0.94 can hide one hero that
 * fell apart, and the whole point of the loop is to know *which* region to patch.
 */

export interface Png {
  width: number
  height: number
  data: Buffer
}

export type DiffMode = 'pixel' | 'masked' | 'downweighted'

export interface RegionScore {
  nodeId: string
  kind: NodeIR['kind']
  box: { x: number; y: number; w: number; h: number }
  /** 0–1, 1 is identical. */
  score: number
  /** Share of the page's area, which is how much this region moves the total. */
  weight: number
  mode: DiffMode
  /** Differing pixels as a share of the region, for the pixel modes. */
  mismatch: number
  /** Where the render actually put it, when the render carried the node at all. */
  rendered?: { x: number; y: number; w: number; h: number }
  note?: string
}

export interface DiffResult {
  /** Area-weighted mean of the region scores. */
  score: number
  /** Structural similarity over the whole page, before masking. */
  ssim: number
  regions: RegionScore[]
  /** `regions` sorted worst first — what the loop reads. */
  worst: RegionScore[]
  /** Reference-sized RGBA map of the differing pixels, for the report. */
  heatmap: Png
}

export function readPng(buf: Buffer): Png {
  const png = PNG.sync.read(buf)
  return { width: png.width, height: png.height, data: png.data }
}

export function writePng(png: Png): Buffer {
  const out = new PNG({ width: png.width, height: png.height })
  png.data.copy(out.data)
  return PNG.sync.write(out)
}

/** A blank canvas in the reference's dimensions. */
export function emptyPng(width: number, height: number): Png {
  return { width, height, data: Buffer.alloc(width * height * 4) }
}

/**
 * Crop to a box, clamped to the image.
 *
 * Regions come from the IR, which was measured on the reference. The rendered
 * page can be a few pixels taller or shorter when something overflowed, and the
 * comparison should report that as a mismatch in the region, not crash.
 */
export function crop(png: Png, box: { x: number; y: number; w: number; h: number }): Png | null {
  const x = Math.max(0, Math.round(box.x))
  const y = Math.max(0, Math.round(box.y))
  const w = Math.min(png.width - x, Math.round(box.w))
  const h = Math.min(png.height - y, Math.round(box.h))
  if (w <= 0 || h <= 0) return null
  const out = emptyPng(w, h)
  for (let row = 0; row < h; row++) {
    png.data.copy(out.data, row * w * 4, ((y + row) * png.width + x) * 4, ((y + row) * png.width + x + w) * 4)
  }
  return out
}

/** Paint a copy of the image flat, which is how a masked region leaves the diff. */
export function flatten(png: Png, box: { x: number; y: number; w: number; h: number }, rgb: [number, number, number]) {
  const x0 = Math.max(0, Math.round(box.x))
  const y0 = Math.max(0, Math.round(box.y))
  const x1 = Math.min(png.width, Math.round(box.x + box.w))
  const y1 = Math.min(png.height, Math.round(box.y + box.h))
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * png.width + x) * 4
      png.data[o] = rgb[0]
      png.data[o + 1] = rgb[1]
      png.data[o + 2] = rgb[2]
      png.data[o + 3] = 255
    }
  }
}

/** The colour that covers most of a region, quantised so near-identical pixels agree. */
export function dominantColor(png: Png, box: { x: number; y: number; w: number; h: number }): string | null {
  const region = crop(png, box)
  if (!region) return null
  const counts = new Map<number, number>()
  for (let i = 0; i < region.data.length; i += 4) {
    if (region.data[i + 3] < 128) continue
    const key = (region.data[i] >> 4 << 8) | (region.data[i + 1] >> 4 << 4) | (region.data[i + 2] >> 4)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let best = -1
  let bestN = 0
  for (const [k, n] of counts) if (n > bestN) ((bestN = n), (best = k))
  if (best < 0) return null
  const hex = (v: number) => ((v & 0xf) * 17).toString(16).padStart(2, '0')
  return `#${hex(best >> 8)}${hex(best >> 4)}${hex(best)}`
}

/**
 * Structural similarity over the whole page.
 *
 * Hand-written because `pixelmatch` answers "how many pixels differ" and SSIM
 * answers "how differently is the page structured" — the loop needs both, since
 * a page can land every pixel's colour and still have everything an inch off.
 * Standard 8×8 windows over luma, with the usual stabilising constants.
 */
export function ssim(a: Png, b: Png, window = 8): number {
  const w = Math.min(a.width, b.width)
  const h = Math.min(a.height, b.height)
  if (!w || !h) return 0
  const la = luma(a)
  const lb = luma(b)
  const C1 = (0.01 * 255) ** 2
  const C2 = (0.03 * 255) ** 2
  let total = 0
  let windows = 0
  for (let y0 = 0; y0 + window <= h; y0 += window) {
    for (let x0 = 0; x0 + window <= w; x0 += window) {
      let sa = 0
      let sb = 0
      let saa = 0
      let sbb = 0
      let sab = 0
      const n = window * window
      for (let y = y0; y < y0 + window; y++) {
        for (let x = x0; x < x0 + window; x++) {
          const va = la[y * a.width + x]
          const vb = lb[y * b.width + x]
          sa += va
          sb += vb
          saa += va * va
          sbb += vb * vb
          sab += va * vb
        }
      }
      const ma = sa / n
      const mb = sb / n
      const va = saa / n - ma * ma
      const vb = sbb / n - mb * mb
      const cov = sab / n - ma * mb
      total += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2))
      windows++
    }
  }
  return windows ? total / windows : 0
}

function luma(png: Png): Float64Array {
  const out = new Float64Array(png.width * png.height)
  for (let i = 0, p = 0; i < png.data.length; i += 4, p++) {
    out[p] = 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2]
  }
  return out
}

/** Differing pixels as a share of the region, 0 when the shape is not comparable. */
function mismatchRatio(a: Png, b: Png, threshold: number): number {
  if (a.width !== b.width || a.height !== b.height) return 1
  const diff = new PNG({ width: a.width, height: a.height })
  const n = pixelmatch(
    new Uint8Array(a.data),
    new Uint8Array(b.data),
    new Uint8Array(diff.data.buffer, diff.data.byteOffset, diff.data.length),
    a.width,
    a.height,
    { threshold, includeAA: false },
  )
  return n / (a.width * a.height)
}

/**
 * Regions the diff is scored over: the deepest visible nodes.
 *
 * Deepest, because they tile the page without covering each other — scoring every
 * container too would count one broken button once for each of its ancestors. The
 * exception is the *band* a container owns: the area inside it that no child
 * covers. That band is where the card's background, border and padding live, and
 * scoring leaves alone would leave a page whose every card lost its fill looking
 * perfect.
 */
export function regionsOf(ir: IR): NodeIR[] {
  const visible = Object.values(ir.nodes).filter((n) => n.visible && n.tag !== 'html' && n.tag !== 'body')
  const children = new Map<string, NodeIR[]>()
  for (const n of visible) {
    if (!n.parent) continue
    const list = children.get(n.parent)
    if (list) list.push(n)
    else children.set(n.parent, [n])
  }
  const sized = (n: NodeIR) => n.box.w >= 2 && n.box.h >= 2
  const leaves = visible.filter((n) => !(children.get(n.id) ?? []).some(sized))
  // A container whose own band is a sliver of its box (a card that is nothing but
  // children) has nothing of its own to score, and its children carry the region.
  const bands = visible.filter((n) => {
    if (!sized(n) || leaves.includes(n)) return false
    const kids = (children.get(n.id) ?? []).filter(sized)
    if (!kids.length) return false
    const covered = kids.reduce((s, c) => s + Math.max(0, c.box.w) * Math.max(0, c.box.h), 0)
    return covered / (n.box.w * n.box.h) < 0.98
  })
  return [...leaves, ...bands]
    .filter(sized)
    .sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)
}

/**
 * Crop to a region, painting `exclude` boxes flat first.
 *
 * Used for a container's own band: the children inside it are scored as their own
 * regions, and counting them here would score a broken child twice and let a
 * correct child paper over a wrong parent.
 */
function maskedCrop(png: Png, box: { x: number; y: number; w: number; h: number }, exclude: Box[]): Png | null {
  const region = crop(png, box)
  if (!region) return null
  for (const e of exclude) {
    flatten(region, { x: e.x - box.x, y: e.y - box.y, w: e.w, h: e.h }, [255, 0, 255])
  }
  return region
}

export interface DiffOptions {
  /** Fonts the page asked for that the machine does not have; their text is downweighted. */
  substituted?: string[]
  /** Node ids a `stitch.config.json` marked dynamic — dates, ads, live counters. */
  dynamic?: string[]
  /** Kinds scored outside the pixel diff. */
  maskedKinds?: NodeIR['kind'][]
  threshold?: number
  /** Rendered boxes seen via `[data-stitch-id]`, for the masked kinds' presence check. */
  rendered?: Map<string, { x: number; y: number; w: number; h: number }>
}

/**
 * Score the render against the reference.
 *
 * Masked kinds are not compared pixel-wise at all — an `ImagePlaceholder` will
 * never match the photograph it stands in for, and chasing it would burn every
 * iteration the loop has. They are scored on what they *can* be held to: the box
 * they occupy, and for images the colour the region holds.
 */
export function diff(reference: Png, rendered: Png, ir: IR, opts: DiffOptions = {}): DiffResult {
  const substituted = new Set(opts.substituted ?? [])
  const dynamic = new Set(opts.dynamic ?? [])
  const maskedKinds = new Set(opts.maskedKinds ?? ['image', 'icon', 'illustration'])
  const threshold = opts.threshold ?? 0.1

  // Masked regions are painted out of both images before the global pass, or the
  // heatmap would point at placeholders instead of at the code.
  const refFlat = { ...reference, data: Buffer.from(reference.data) }
  const renFlat = { ...rendered, data: Buffer.from(rendered.data) }
  const maskBoxes = Object.values(ir.nodes).filter(
    (n) => n.visible && (maskedKinds.has(n.kind) || dynamic.has(n.id)) && n.box.w >= 2 && n.box.h >= 2,
  )
  for (const m of maskBoxes) {
    flatten(refFlat, m.box, [255, 0, 255])
    flatten(renFlat, m.box, [255, 0, 255])
  }

  const regions: RegionScore[] = []
  const scored = new Set(regionsOf(ir).map((r) => r.id))
  const boxes = (n: NodeIR): Box[] =>
    n.children
      .map((id) => ir.nodes[id])
      .filter((c) => c && c.visible && scored.has(c.id))
      .map((c) => c.box)

  for (const n of regionsOf(ir)) {
    const area = Math.max(0, n.box.w) * Math.max(0, n.box.h)
    const weight = area / (ir.viewport.width * ir.viewport.height)
    const seen = opts.rendered?.get(n.id)
    const base = { nodeId: n.id, kind: n.kind, box: n.box, weight, rendered: seen }
    // Children are excluded only when they are scored themselves, which is what
    // makes a parent's band its own and not a second look at its children.
    const inner = boxes(n)

    if (dynamic.has(n.id)) {
      regions.push({ ...base, score: 1, mode: 'masked', mismatch: 0, note: 'dynamic region' })
      continue
    }

    if (maskedKinds.has(n.kind)) {
      if (!seen || seen.w <= 0 || seen.h <= 0) {
        regions.push({ ...base, score: 0, mode: 'masked', mismatch: 1, note: 'not present in render' })
        continue
      }
      // Box agreement, plus how much of the region the render actually paints:
      // a placeholder that collapsed to nothing has the right id and no area.
      // Position is checked too: an icon in the wrong corner is not a matched
      // icon, and a shape-only score would call it one.
      const dw = 1 - Math.min(1, Math.abs(seen.w - n.box.w) / Math.max(1, n.box.w))
      const dh = 1 - Math.min(1, Math.abs(seen.h - n.box.h) / Math.max(1, n.box.h))
      const dx = 1 - Math.min(1, Math.abs(seen.x - n.box.x) / Math.max(1, n.box.w))
      const dy = 1 - Math.min(1, Math.abs(seen.y - n.box.y) / Math.max(1, n.box.h))
      const shape = (dw * dh + dx * dy + Math.min(1, (seen.w * seen.h) / Math.max(1, area))) / 3
      let score = shape
      let note = n.kind === 'icon' ? 'presence, box and position' : 'box, position and area'
      if (n.kind === 'image') {
        // Both from the *unmasked* pair: `renFlat` has this very box painted
        // magenta, so asking it for a colour always answered `#ff00ff` and pinned
        // every image's colour term to zero.
        const a = dominantColor(reference, n.box)
        const b = dominantColor(rendered, n.box)
        if (a && b) {
          const ca = parseInt(a.slice(1), 16)
          const cb = parseInt(b.slice(1), 16)
          const near = (x: number, y: number) => Math.abs(((ca >> x) & 0xff) - ((cb >> y) & 0xff)) / 255
          const color = 1 - Math.min(1, (near(16, 16) + near(8, 8) + near(0, 0)) / 3)
          score = shape * 0.6 + color * 0.4
          note = `box + dominant colour (ref ${a}, got ${b})`
        }
      }
      regions.push({ ...base, score: Math.max(0, Math.min(1, score)), mode: 'masked', mismatch: 1 - score, note })
      continue
    }

    const a = maskedCrop(refFlat, n.box, inner)
    const b = maskedCrop(renFlat, n.box, inner)
    if (!a || !b) {
      regions.push({ ...base, score: 1, mode: 'masked', mismatch: 0, note: 'outside the viewport' })
      continue
    }
    const mismatch = mismatchRatio(a, b, threshold)
    const score = 1 - mismatch
    // A substituted font makes every glyph in the region differ for a reason the
    // generated code cannot fix. Keeping the region at a third of its weight
    // rather than masking it: the text is still in the right place and size.
    const substitutedFont = substituted.size > 0 && isTextual(n)
    regions.push({
      ...base,
      score,
      mode: substitutedFont ? 'downweighted' : 'pixel',
      mismatch,
      note: substitutedFont ? 'font substituted' : undefined,
      weight: substitutedFont ? weight * 0.3 : weight,
    })
  }

  const totalWeight = regions.reduce((s, r) => s + r.weight, 0) || 1
  const score = regions.reduce((s, r) => s + r.score * r.weight, 0) / totalWeight

  const heat = emptyPng(reference.width, reference.height)
  if (refFlat.width === renFlat.width && refFlat.height === renFlat.height) {
    pixelmatch(
      new Uint8Array(refFlat.data),
      new Uint8Array(renFlat.data),
      new Uint8Array(heat.data.buffer, heat.data.byteOffset, heat.data.length),
      refFlat.width,
      refFlat.height,
      { threshold, includeAA: false, alpha: 0.35 },
    )
  }

  return {
    score,
    ssim: ssim(refFlat, renFlat),
    regions,
    worst: [...regions].sort((a, b) => a.score - b.score),
    heatmap: heat,
  }
}

function isTextual(n: NodeIR): boolean {
  return n.kind === 'text' || (n.kind === 'container' && Boolean(n.text && n.text.trim()))
}
