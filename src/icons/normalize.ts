import { createHash } from 'node:crypto'
import type { IconChild } from '../types.ts'

/**
 * Attributes that vary between two copies of the same drawing without changing
 * it. `class` is the loud one: Stitch emits `<path class="st0">`, Lucide emits
 * nothing, and hashing either would never match.
 */
const IGNORED = new Set(['class', 'id', 'style', 'clip-path', 'mask'])

const isNumeric = (s: string) => /^-?\d*\.?\d+(e-?\d+)?$/i.test(s.trim())

export function canonicalizeValue(v: unknown): string {
  if (typeof v !== 'string') return String(v)
  if (isNumeric(v)) return String(Math.round(Number(v) * 100) / 100)
  return v
}

export function canonicalizeAttrs(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .filter(([k]) => !IGNORED.has(k) && !k.startsWith('data-'))
    // Path data carries its numbers inside the string, so it needs its own pass.
    .map(([k, v]) => `${k}=${k === 'd' ? normalizePathData(v) : canonicalizeValue(v)}`)
    .sort()
    .join(',')
}

/**
 * Order-insensitive shape string. Sibling order and attribute order are both
 * sorted away, so a reordered or reformatted copy of an icon hashes the same.
 */
export function normalizeShape(children: IconChild[]): string {
  return children
    .map(([tag, attrs]) => `${tag}|${canonicalizeAttrs(attrs)}`)
    .sort()
    .join(';')
}

const NUMERIC_IN_PATH = /-?\d*\.?\d+(?:e-?\d+)?/gi

/** Path data with every number rounded, so 12.0000001 and 12 agree. */
export function normalizePathData(d: string): string {
  return d.replace(NUMERIC_IN_PATH, (n) => String(Math.round(Number(n) * 100) / 100)).replace(/\s+/g, ' ').trim()
}

export function hashShape(children: IconChild[]): string {
  return createHash('sha1').update(normalizeShape(children)).digest('hex').slice(0, 16)
}

export interface IconFeatures {
  /** Number of drawing commands. Lucide icons are usually 1-4. */
  parts: number
  /** Straight-line segments (M/L/H/V) and curve commands (C/S/Q/A). */
  lines: number
  curves: number
  circles: number
  rects: number
  /** Bounding box of all path coordinates, quantized. */
  bbox: { x1: number; y1: number; x2: number; y2: number } | null
}

/**
 * Coarse fingerprint used only to rank candidates for the fuzzy rung. It is
 * deliberately loose: this narrows ~1850 icons to a handful, then the caller
 * shows those to a human or a model. It never decides on its own.
 */
export function features(children: IconChild[]): IconFeatures {
  let lines = 0
  let curves = 0
  let circles = 0
  let rects = 0
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity

  for (const [tag, attrs] of children) {
    if (tag === 'circle') circles++
    if (tag === 'rect') rects++

    const d = attrs.d
    if (d) {
      for (const cmd of d.match(/[a-zA-Z]/g) ?? []) {
        if ('MLHVmlhv'.includes(cmd)) lines++
        else if ('CSQAcsqa'.includes(cmd)) curves++
      }
      const nums = d.match(NUMERIC_IN_PATH)
      if (nums) {
        for (let i = 0; i + 1 < nums.length; i += 2) {
          const x = Number(nums[i])
          const y = Number(nums[i + 1])
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue
          if (x < x1) x1 = x
          if (y < y1) y1 = y
          if (x > x2) x2 = x
          if (y > y2) y2 = y
        }
      }
    }

    for (const [k, v] of Object.entries(attrs)) {
      if (!['cx', 'cy', 'x', 'y'].includes(k)) continue
      const n = Number(v)
      if (!Number.isFinite(n)) continue
      if (k === 'cx' || k === 'x') {
        if (n < x1) x1 = n
        if (n > x2) x2 = n
      } else {
        if (n < y1) y1 = n
        if (n > y2) y2 = n
      }
    }
  }

  const bbox = Number.isFinite(x1) ? { x1: Math.round(x1), y1: Math.round(y1), x2: Math.round(x2), y2: Math.round(y2) } : null
  return { parts: children.length, lines, curves, circles, rects, bbox }
}
