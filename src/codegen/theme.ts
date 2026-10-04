import type { FontLink } from './fonts.ts'
import { ICON_FONT, type IR } from '../types.ts'
import { assignPalette, colorUses, isDark, pageBackground, TOKENS } from './colors.ts'

export { isDark as isDarkPage, pageBackground, toHex } from './colors.ts'

/**
 * The page's palette, written over the template's shadcn tokens.
 *
 * The template ships a grey :root and a grey .dark. Both are replaced here, and
 * only one of them survives: the output is a single theme, the one the input
 * page was drawn in. Leaving the other one in place would mean a page whose
 * colours depend on a `dark` class it may never carry.
 */

/** The template's `:root` block, which the generated palette replaces. */
const ROOT_BLOCK = /:root\s*\{[^}]*\}/
const DARK_BLOCK = /\.dark\s*\{[^}]*\}/

export function themeCss(ir: IR, dark: boolean, fonts: FontLink): string {
  const background = pageBackground(ir)
  const palette = assignPalette(background, colorUses(ir, background))

  // The page's own family leads the sans stack. Everything shadcn draws that is
  // not explicitly a heading inherits it, which is most of the visible text.
  //
  // Chosen by how much text the family actually paints, not by declaration
  // order in the source's `<link>`: that list is alphabetical once
  // `parseFontLinks` sorts it, and `Material Symbols Outlined` sorts before any
  // real body family — which rendered the whole page in the ligature font.
  // A family declared but never used (a stale link entry) never wins a slot.
  const text = [...ir.fonts].filter((f) => !ICON_FONT.test(f.family)).sort((a, b) => b.count - a.count)
  const sans = text[0]?.family ?? fonts.families[0]?.name ?? 'Geist Variable'
  const heading = text.find((f) => f.heading)?.family ?? sans

  const decls = TOKENS.map((t) => `    --${t}: ${palette[t]};`).join('\n')
  const selector = dark ? '.dark' : ':root'

  return `/* --- generated from the source page --- */
${selector} {
${decls}
    --radius: 0.625rem;
}

@theme inline {
    --font-sans: '${sans}', ui-sans-serif, system-ui, sans-serif;
    --font-heading: '${heading}', ui-sans-serif, system-ui, sans-serif;
}
`
}

/**
 * Fold the generated palette into the template's stylesheet.
 *
 * Replacing the two colour blocks rather than appending is what keeps the output
 * to one theme: the template's `:root` and `.dark` are the same specificity as
 * what we write, so an appended block would lose or win by source order alone,
 * which is not a decision this tool should be making by accident.
 */
export function applyTheme(css: string, theme: string): string {
  const stripped = css.replace(ROOT_BLOCK, '/* replaced by the generated palette */').replace(DARK_BLOCK, '')
  return `${stripped}\n${theme}`
}

