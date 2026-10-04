#!/usr/bin/env node
import { Command } from 'commander'
import { readFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { ingest } from './ingest.ts'
import { extract } from './extract.ts'
import { classify, ambiguous, stats, interiorOf } from './classify/classify.ts'
import { writeArtifacts, writeClassifications } from './report.ts'
import { evalDir } from './eval.ts'
import { scaffoldProject, templateExists } from './codegen/project.ts'
import { isDarkPage, pageBackground } from './codegen/theme.ts'
import { parseAndCheck } from './codegen/check.ts'
import { geometryPatcher, readDynamic, verify } from './verify/index.ts'

const program = new Command()

program
  .name('stitch')
  .description('Stitch HTML + screenshot → Vite + React + TS + Tailwind v4 + shadcn')
  .argument('<code.html>', 'source HTML')
  .argument('<screenshot.png>', 'reference screenshot, sets the viewport')
  .option('-o, --out <dir>', 'output directory', './out')
  .option('--stack <name>', 'target stack', 'vite-react-ts')
  .option('--offline', 'skip all LLM calls', false)
  .option('--max-iter <n>', 'verify loop iterations', (v) => parseInt(v, 10), 5)
  .option('--debug-ir', 'dump ir.json + viewer.html', false)
  .option('--dpr <n>', 'device scale factor for the reference shot', (v) => parseFloat(v), 1)
  .action(async (htmlArg: string, shotArg: string, opts) => {
    const html = resolve(htmlArg)
    const shot = resolve(shotArg)
    const out = resolve(opts.out)

    console.error(`stitch ${htmlArg} ${shotArg} → ${opts.out}`)

    const ing = await ingest(html, shot, { deviceScaleFactor: opts.dpr })
    try {
      const ir = await extract(ing)
      ir.source.html = html

      const visible = Object.values(ir.nodes).filter((n) => n.visible).length
      const repeats = new Set(
        Object.values(ir.nodes).filter((n) => n.repeat).map((n) => n.repeat!.siblingIds.join(',')),
      ).size

      const classes = classify(ir)
      const interior = interiorOf(ir.nodes, classes)
      const s = stats(classes, ir, interior)
      const amb = ambiguous(classes, interior)

      console.error(`  ${Object.keys(ir.nodes).length} nodes (${visible} visible), ${repeats} repeat groups`)
      console.error(`  ${ir.colors.length} colors, ${ir.fonts.length} font families`)
      console.error(`  classified ${s.accepted} · ${s.icons} icons · ${s.ambiguous} ambiguous`)
      const ranked = Object.entries(s.byComponent).sort((a, b) => b[1] - a[1])
      if (ranked.length) console.error(`  ${ranked.map(([k, v]) => `${k}×${v}`).join(' ')}`)
      if (amb.length) {
        console.error(`  ${amb.length} ambiguous node(s) queued for the LLM pass (M6)`)
        for (const c of amb.slice(0, 5)) {
          console.error(`    ${c.nodeId} ${c.candidates.map((x) => `${x.name}:${x.score.toFixed(2)}`).join(' ')}`)
        }
      }

      if (!templateExists()) {
        console.error('  codegen: template missing, skipping')
        return
      }

      const title = pageTitle(await readFile(html, 'utf8'))
      const bg = pageBackground(ir)
      const gen = await scaffoldProject(ir, classes, {
        out,
        html,
        title,
        dark: isDarkPage(bg),
      })

      // Debug artifacts go in a dot-directory beside the project, written after
      // the scaffold: the scaffold replaces the output directory wholesale, and
      // these have to survive that.
      const art = await writeArtifacts(ir, join(out, '.stitch'), shot)
      const cls = await writeClassifications(classes, amb, join(out, '.stitch'))

      const check = await parseAndCheck(out)
      console.error('')
      console.error(`  generated ${gen.files.length} files → ${out}`)
      console.error(`  fonts     ${gen.fonts.referenced.join(', ') || '(none)'}`)
      const rankedUi = [...new Set([...classes.values()].map((c) => c.component).filter(Boolean))]
      console.error(`  ui        ${rankedUi.length} components`)
      console.error(`  ir.json   ${art.irJson}`)
      console.error(`  viewer    ${art.viewer}`)
      console.error(`  classify  ${cls}`)
      for (const w of [...gen.warnings, ...check.problems]) console.error(`  warn      ${w}`)

      if (!check.ok) {
        console.error('  ✗ generated files do not parse')
        process.exitCode = 1
      } else {
        console.error(`  ✓ ${check.files.length} files parse clean`)
      }

      // Verify needs the page to parse, because it patches that same AST: a
      // scoped edit into a file with a syntax error has nothing to hold on to.
      if (check.ok) {
        const verified = await verify({
          dir: out,
          ir,
          reference: shot,
          maxIter: opts.maxIter,
          // Geometry only, which is the one correction the loop can make from
          // measurement alone. Judgement calls — wrong component, wrong variant —
          // are the M6 LLM patcher's, and the loop runs without one.
          patch: opts.maxIter > 0 ? geometryPatcher(out) : null,
          dynamic: await readDynamic(html),
          ambiguous: amb.map((c) => ({ nodeId: c.nodeId, candidates: c.candidates })),
          onProgress: (line) => console.error(line),
        })
        console.error('')
        console.error(`  score     ${(verified.best.score * 100).toFixed(1)}% (ssim ${verified.best.ssim.toFixed(4)})`)
        console.error(`  report    ${verified.reportPath}`)
        if (!verified.iterations.length) {
          console.error('  warn      the generated project did not build; nothing was scored')
        }
      }
    } finally {
      await ing.close()
    }
  })

program
  .command('eval <fixturesDir>')
  .description('regression: precision/recall against labelled fixtures')
  .action(async (dirArg: string) => {
    const ok = await evalDir(resolve(dirArg))
    if (!ok) process.exitCode = 1
  })

/** The page title, so the generated project is named after its source. */
function pageTitle(html: string): string {
  return /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() || basename(html, '.html')
}

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
