import { features, hashShape, type IconFeatures } from '../icons/normalize.ts'
import { LUCIDE_ALIASES, LUCIDE_BY_HASH, LUCIDE_FEATURES, LUCIDE_NAMES } from '../registry/lucide/index.generated.ts'
import type { IconMatch, IconShape } from '../types.ts'

const NAMES: readonly string[] = LUCIDE_NAMES

/** `arrow-right` -> `ArrowRight`, `arrow-down-0-1` -> `ArrowDown01`. */
export function toPascal(kebab: string): string {
  return kebab
    .split('-')
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join('')
}

/** Resolve a possibly-renamed Lucide name to its current spelling. */
export function canonicalName(name: string): string | null {
  const resolved = LUCIDE_ALIASES[name] ?? name
  return NAMES.includes(resolved) ? resolved : null
}

/**
 * Coarse similarity in 0..1. Command counts carry most of the signal; the
 * bounding box only separates icons that are otherwise the same complexity.
 * This ranks candidates for review, it never auto-accepts on its own.
 */
function similarity(a: IconFeatures, b: IconFeatures): number {
  const prim = (f: IconFeatures) => f.parts * 4 + f.lines + f.curves * 1.5 + f.circles * 2 + f.rects * 2
  const pa = prim(a)
  const pb = prim(b)
  const primScore = 1 - Math.abs(pa - pb) / Math.max(pa, pb, 1)

  let bboxScore = 0.5
  if (a.bbox && b.bbox) {
    const d =
      Math.abs(a.bbox.x1 - b.bbox.x1) +
      Math.abs(a.bbox.y1 - b.bbox.y1) +
      Math.abs(a.bbox.x2 - b.bbox.x2) +
      Math.abs(a.bbox.y2 - b.bbox.y2)
    bboxScore = Math.max(0, 1 - d / 48)
  }

  return 0.6 * primScore + 0.4 * bboxScore
}

const FUZZY_FLOOR = 0.55

/**
 * The Lucide ladder. Deterministic rungs first: an explicit class, then an exact
 * shape hash. Only when both miss do we rank candidates, and even then we return
 * them for review rather than guessing.
 */
export function matchIcon(shape: IconShape): IconMatch {
  // Rung 1 — Stitch and shadcn both leave `lucide lucide-<name>` on the element.
  for (const token of (shape.className ?? '').split(/\s+/)) {
    const m = /^lucide-(.+)$/.exec(token)
    if (!m) continue
    const name = canonicalName(toPascal(m[1]))
    if (name) return { via: 'class', name, confidence: 1 }
  }

  // Rung 2 — exact shape, order and formatting normalized away.
  const hit = LUCIDE_BY_HASH[hashShape(shape.children)]
  if (hit) return { via: 'pathHash', name: hit, confidence: 0.98 }

  // Rung 3 — rank by coarse fingerprint. LLM vision (rung 4) plugs in here.
  // The prefilter matters more than the metric: a 5-part drawing can never be
  // the same icon as a 1-part one, and comparing it to every export wastes the
  // candidate list on shapes that only look similar in aggregate. Ranking runs
  // over the feature map, which is keyed by canonical name and holds one entry
  // per distinct drawing — every alias shares its shape.
  const f = features(shape.children)
  const spread = Math.max(1, Math.round(f.parts * 0.5))
  const ranked = Object.keys(LUCIDE_FEATURES)
    .filter((name) => Math.abs(LUCIDE_FEATURES[name].parts - f.parts) <= spread)
    .map((name) => ({ name, score: similarity(f, LUCIDE_FEATURES[name]) }))
    .filter((c) => c.score >= FUZZY_FLOOR)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  if (ranked.length === 0) {
    // Rung 5 — not a Lucide icon at all. Caller emits it verbatim.
    return { via: 'none', candidates: [] }
  }

  return { via: 'fuzzy', name: ranked[0].name, confidence: ranked[0].score, candidates: ranked.map((c) => c.name) }
}
