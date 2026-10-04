import type { NodeIR } from '../types.ts'

export interface Ctx {
  nodes: Record<string, NodeIR>
  /** Modal background of the page, so `outline` can mean "not filled". */
  pageBackground: string
}

/**
 * Each signal returns 0..1 and the weights sum to about 1, so a total score
 * reads directly as confidence. A signature that can reach 1.0 on any random
 * div is miscalibrated: every one of these has at least one signal only the
 * real component satisfies.
 */
export interface Signature {
  name: string
  /** Score floor once `requires` passes. See the note in signatures.ts. */
  base?: number
  weight: Record<string, (n: NodeIR, ctx: Ctx) => number>
  variants?: Record<string, (n: NodeIR, ctx: Ctx) => string | null>
  /** Hard gates. Failing one scores 0 regardless of signals. */
  requires?: (n: NodeIR, ctx: Ctx) => boolean
  conflicts?: string[]
}

/**
 * Largest length in a computed value. `padding` and friends are shorthands
 * ("10px 16px"), and `parseFloat` would silently return only the first, making
 * "is this padded?" answer 10 for `8px 4px` and 8 for `8px`.
 */
export const px = (v: string): number => {
  const found = v.match(/-?\d*\.?\d+/g)
  return found ? Math.max(...found.map(Number)) : 0
}

export const kids = (n: NodeIR, ctx: Ctx): NodeIR[] => n.children.map((id) => ctx.nodes[id]).filter(Boolean)

export const descendants = (n: NodeIR, ctx: Ctx): NodeIR[] => {
  const out: NodeIR[] = []
  const stack = [...kids(n, ctx)]
  while (stack.length) {
    const cur = stack.pop()!
    out.push(cur)
    stack.push(...kids(cur, ctx))
  }
  return out
}

export const area = (n: NodeIR): number => n.box.w * n.box.h

export const isOpaqueBg = (v: string): boolean => Boolean(v) && !/rgba\(0, 0, 0, 0\)|transparent/.test(v)

/**
 * "Is this element filled?" — the question the outline/ghost/default variants
 * actually turn on. A transparent background only counts as filled when it
 * differs from the page, which is how a dark button on a white page reads.
 */
export const isFilled = (n: NodeIR, ctx: Ctx): boolean =>
  isOpaqueBg(n.style.backgroundColor) && n.style.backgroundColor !== ctx.pageBackground

export const isRound = (n: NodeIR): boolean => px(n.style.borderRadius) >= 4

/**
 * Border width per side, in CSS shorthand order (top right bottom left).
 *
 * The one-sided border is what separates a framed box from a rule: a header's
 * `border-bottom: 1px` is a divider, an Alert's `border: 1px` is a frame, and
 * `px()` reports both as framed because it keeps the largest number it finds.
 */
export const sides = (v: string): [number, number, number, number] => {
  const p = (v.match(/-?\d*\.?\d+px/g) ?? []).map(parseFloat)
  if (p.length === 1) return [p[0], p[0], p[0], p[0]]
  if (p.length === 2) return [p[0], p[1], p[0], p[1]]
  if (p.length === 3) return [p[0], p[1], p[2], p[1]]
  if (p.length >= 4) return [p[0], p[1], p[2], p[3]]
  return [0, 0, 0, 0]
}

/** A border down the vertical edges — a frame — as opposed to a one-edge rule. */
export const hasSideBorder = (n: NodeIR): boolean => {
  const [, right, , left] = sides(n.style.borderWidth)
  return right > 0 || left > 0
}

/** Perception-weighted luminance, 0..1. Used only for light/dark bucketing. */
export function luminance(color: string): number | null {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color)
  if (!m) return null
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const isDark = (color: string): boolean => (luminance(color) ?? 1) < 0.4

/** A single Lucide-sized stroke icon, or nothing. */
export const iconChild = (n: NodeIR, ctx: Ctx): NodeIR | null =>
  kids(n, ctx).find((c) => c.kind === 'icon') ?? null

export const textContent = (n: NodeIR, ctx: Ctx): string =>
  (n.text ?? '') + descendants(n, ctx).map((d) => d.text ?? '').join(' ')
