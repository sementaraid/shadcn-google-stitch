import { readFile } from 'node:fs/promises'
import { ICON_FONT } from '../types.ts'

export interface FontLink {
  families: { name: string; weights: number[] }[]
  /** The single `<link>` the page should carry, or null when the source used none. */
  href: string | null
  /** Families the source referenced by name, in declaration order. */
  referenced: string[]
}

/** Generic CSS families are the tail of a stack, never a webfont to fetch. */
const GENERIC = new Set([
  'sans-serif',
  'serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'inherit',
  'initial',
  'unset',
])

/**
 * Read the families the source page asked Google for. Three shapes exist in the
 * wild and Stitch emits all three, so all three are parsed rather than
 * assuming the modern one.
 */
export function parseFontLinks(html: string): FontLink {
  const families = new Map<string, Set<number>>()
  const order: string[] = []

  const remember = (family: string, weights: number[]) => {
    const name = family.replace(/\+/g, ' ').trim()
    if (!name || GENERIC.has(name.toLowerCase())) return
    if (!families.has(name)) {
      families.set(name, new Set())
      order.push(name)
    }
    const set = families.get(name)!
    for (const w of weights) set.add(w)
  }

  const add = (url: string) => {
    // css2 form: `family=Inter:wght@400;500;700` (repeats for several families)
    for (const m of url.matchAll(/family=([^&:]+)(?::wght@([^&]+))?/g)) {
      const weights = (m[2] ?? '')
        .split(/[;,]/)
        .flatMap((part) => {
          const range = /^(\d+)\.\.(\d+)$/.exec(part)
          return range ? [Number(range[1]), Number(range[2])] : [Number(part)]
        })
        .filter((n) => Number.isFinite(n) && n > 0)
      remember(m[1], weights.length ? weights : [400])
    }

    // legacy v1 form: `family=Roboto:400,700`
    for (const m of url.matchAll(/family=([^&:]+):(\d[\d,]*)/g)) {
      remember(m[1], m[2].split(',').map(Number))
    }
    // v1 without weights: `family=Lato`
    for (const m of url.matchAll(/family=([A-Za-z+ ]+)(?:&|$|')/g)) remember(m[1], [])
  }

  for (const m of html.matchAll(/<link[^>]+href=["']([^"']*fonts\.googleapis\.com[^"']*)["']/gi)) add(m[1])
  for (const m of html.matchAll(/@import\s+url\(["']?([^"')]*fonts\.googleapis\.com[^"')]*)["']?\)/gi)) add(m[1])

  // Request exactly what the source asked Google for. Narrowing to the weights
  // this emitter happens to write is what broke fidelity: the source's own CSS
  // rarely states a weight, because `<strong>` and `<th>` get theirs from the UA
  // stylesheet, so a filter over `font-weight:` dropped the bold face and the
  // browser synthesised one from a different weight instead — visibly wider text
  // that then wrapped. The declared list is already the author's own narrowing.
  const list = order
    .filter((name) => !ICON_FONT.test(name))
    .map((name) => {
      const declared = [...families.get(name)!].sort((a, b) => a - b)
      return { name, weights: declared.length ? declared : [400] }
    })

  if (list.length === 0) return { families: [], href: null, referenced: [] }

  // Dedupe, sort, and emit one URL. `display=swap` because the verify screenshot
  // waits on `document.fonts.ready`, and a blocked font would stall it.
  const query = [...list]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => `family=${f.name.replace(/ /g, '+')}:wght@${f.weights.sort((a, b) => a - b).join(';')}`)
    .join('&')

  return {
    families: list,
    href: `https://fonts.googleapis.com/css2?${query}&display=swap`,
    referenced: list.map((f) => f.name),
  }
}

export function fontLinksHtml(link: FontLink): string {
  if (!link.href) return '  <title>App</title>'
  return [
    '  <link rel="preconnect" href="https://fonts.googleapis.com">',
    '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `  <link rel="stylesheet" href="${link.href}">`,
  ].join('\n')
}

export async function readPageHtml(path: string): Promise<string> {
  return readFile(path, 'utf8')
}
