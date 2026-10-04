/**
 * culori ships no type declarations and has no `@types` package. Only the
 * handful of entry points the theme extractor uses are declared — enough for
 * `tsc` to check the call sites without pulling in the full colour-space API.
 */
declare module 'culori' {
  export interface Oklch {
    mode: 'oklch'
    l: number
    c: number
    h: number
  }

  export interface Oklab {
    mode: 'oklab'
    l: number
    a: number
    b: number
  }

  export function converter(mode: 'oklch'): (color: unknown) => Oklch | undefined
  export function converter(mode: 'oklab'): (color: unknown) => Oklab | undefined
  export function parse(color: string): unknown
  export function formatCss(color: unknown): string
  export function wcagContrast(a: unknown, b: unknown): number
  export function differenceEuclidean(mode?: string): (a: Oklch, b: Oklch) => number
}
