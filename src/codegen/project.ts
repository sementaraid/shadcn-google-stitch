import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IR } from '../types.ts'
import { emit } from './emit.ts'
import { fontLinksHtml, parseFontLinks, readPageHtml } from './fonts.ts'
import { applyTheme, themeCss } from './theme.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
export const TEMPLATE = resolve(HERE, '../../templates/vite-react-ts')

/**
 * Files the generated project owns. Everything else is copied from the template
 * untouched — the vendored shadcn components in particular, which are the whole
 * reason the output compiles.
 */
const TEMPLATE_SKIP = new Set(['node_modules', 'dist', '.git', 'tsconfig.app.tsbuildinfo', 'tsconfig.node.tsbuildinfo'])

export interface PlanOptions {
  out: string
  html: string
  title: string
  dark: boolean
}

export async function scaffoldProject(ir: IR, classes: Parameters<typeof emit>[1], opts: PlanOptions) {
  const { out } = opts
  await rm(out, { recursive: true, force: true })
  await mkdir(out, { recursive: true })

  await cp(TEMPLATE, out, {
    recursive: true,
    filter: (src) => !TEMPLATE_SKIP.has(src.split('/').pop() ?? ''),
  })

  const { files, warnings } = emit(ir, classes)
  for (const [rel, contents] of files) {
    const path = join(out, rel)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, contents)
  }

  // The page's own fonts, resolved from the source HTML into a single link.
  const sourceHtml = await readPageHtml(opts.html)
  const fonts = parseFontLinks(sourceHtml)
  const title = opts.title || 'App'
  await writeFile(
    join(out, 'index.html'),
    `<!doctype html>
<html lang="en"${opts.dark ? ' class="dark"' : ''}>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
${fontLinksHtml(fonts)}
    <title>${title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  )

  // The generated palette replaces the template's own `:root` / `.dark` blocks,
  // so the output carries exactly one theme — the one the source was drawn in.
  const cssPath = join(out, 'src/index.css')
  const base = await readFile(cssPath, 'utf8')
  await writeFile(cssPath, applyTheme(base, themeCss(ir, opts.dark, fonts)))

  return { files: [...files.keys()], warnings, fonts }
}

export function templateExists(): boolean {
  return existsSync(join(TEMPLATE, 'package.json'))
}
