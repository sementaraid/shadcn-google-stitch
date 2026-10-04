import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { IR } from '../types.ts'
import { buildProject, capture } from './capture.ts'
import { type DiffResult, diff, readPng, writePng } from './diff.ts'
import { AstPatcher } from './patch.ts'
import { writeReport, type IterationRecord, type ReportInput } from './report.ts'

/**
 * The verify loop: build, shoot, diff, patch one region, repeat.
 *
 * The loop is deliberately dumb about *what* to change — the patcher decides,
 * and with no patcher it runs once and reports. Iterating on nothing would burn
 * rebuilds to produce the same number.
 */

export interface PatchContext {
  ir: IR['nodes']
  region: DiffResult['regions'][number]
}

export interface Patcher {
  patch(ctx: PatchContext): Promise<string | null>
}

export interface VerifyOptions {
  dir: string
  ir: IR
  reference: string
  maxIter: number
  /** Default 0.005 ssim: below this a rebuild is not earning its time. */
  minDelta?: number
  /** Patch one region. `null` disables the loop, which is the offline path. */
  patch?: Patcher | null
  dynamic?: string[]
  /** Queued-LLM nodes, for the report's confidence table. */
  ambiguous?: ReportInput['ambiguous']
  onProgress?: (line: string) => void
}

export interface VerifyResult {
  iterations: IterationRecord[]
  best: IterationRecord
  reportPath: string
  /** The last build's output, kept so a failure is readable rather than silent. */
  buildLog: string
  converged: boolean
}

export async function verify(opts: VerifyOptions): Promise<VerifyResult> {
  const { dir, ir } = opts
  const log = opts.onProgress ?? (() => {})
  const ref = readPng(await readFile(opts.reference))
  const outDir = join(dir, '.stitch')
  await mkdir(outDir, { recursive: true })

  const families = ir.fonts.map((f) => f.family)
  const iterations: IterationRecord[] = []
  let still = 0
  let buildLog = ''

  for (let i = 0; i <= Math.max(0, opts.maxIter); i++) {
    const built = await buildProject(dir)
    buildLog = built.log
    if (!built.ok) {
      log(`  iteration ${i}: build failed${built.log.trim() ? ' — see report.html' : ''}`)
      break
    }

    const cap = await capture(dir, ir, families)
    const shot = join(outDir, `render-${i}.png`)
    const heat = join(outDir, `heatmap-${i}.png`)
    await writeFile(shot, cap.png)

    const result = diff(ref, readPng(cap.png), ir, {
      substituted: cap.missingFonts,
      dynamic: opts.dynamic,
      rendered: cap.boxes,
    })
    await writeFile(heat, writePng(result.heatmap))

    const record: IterationRecord = { index: i, score: result.score, ssim: result.ssim, patches: [], shot, heat, diff: result }
    iterations.push(record)
    const worst = result.worst[0]
    log(
      `  iteration ${i}: score ${(result.score * 100).toFixed(1)}% · ssim ${result.ssim.toFixed(4)}` +
        ` · worst ${worst ? `${worst.nodeId} ${(worst.score * 100).toFixed(0)}%` : '—'}`,
    )

    // Two flat rounds in a row means patches have stopped paying for themselves.
    // One flat round is noise: a rebuild can land a hair differently.
    const previous = iterations.at(-2)
    if (previous) {
      if (Math.abs(result.ssim - previous.ssim) < (opts.minDelta ?? 0.005)) {
        if (++still >= 2) {
          log('  no further change; stopping')
          break
        }
      } else still = 0
    }

    if (!opts.patch || i >= opts.maxIter) break

    // Walk the worst regions until the patcher finds something it can fix. A
    // region can be below the threshold for reasons no patch here addresses (a
    // substituted font, a component that is simply the wrong one), and stopping
    // at the first of those would end the loop on the healthiest page's worst
    // region rather than on the page's fixable ones.
    const candidates = result.worst.filter((r) => r.score < 0.9 && r.mode !== 'masked')
    let noted = false
    for (const target of candidates) {
      const note = await opts.patch.patch({ ir: ir.nodes, region: target })
      if (!note) continue
      record.patches.push(note)
      log(`  patch ${target.nodeId}: ${note}`)
      noted = true
      break
    }
    if (!noted) {
      log('  nothing patchable left; stopping')
      break
    }
  }

  const best = iterations.reduce((a, b) => (b.score > a.score ? b : a), iterations[0])
  const reportPath = await writeReport({ ir, iterations, buildLog, ambiguous: opts.ambiguous }, outDir)
  return { iterations, best, reportPath, buildLog, converged: still >= 2 }
}

/**
 * The deterministic patcher: move a region toward the box the reference measured.
 *
 * Geometry is the one correction the loop can make without a model — the IR
 * holds where the node *was*, the render reports where it landed, and the
 * difference is arithmetic. Anything beyond that (a wrong component, a wrong
 * variant) is a judgement call and belongs to the M6 LLM patcher.
 */
export function geometryPatcher(dir: string): Patcher {
  return {
    async patch({ ir, region }) {
      const patcher = new AstPatcher(dir)
      await patcher.load()
      const result = await patcher.patchGeometry(region.nodeId, region, ir)
      if (result) await patcher.save()
      return result?.note ?? null
    },
  }
}

/** A `stitch.config.json` beside the source HTML, marking regions not worth chasing. */
export async function readDynamic(htmlPath: string): Promise<string[]> {
  const config = join(dirname(htmlPath), 'stitch.config.json')
  if (!existsSync(config)) return []
  try {
    const parsed = JSON.parse(await readFile(config, 'utf8')) as { dynamic?: string[] }
    return Array.isArray(parsed.dynamic) ? parsed.dynamic : []
  } catch {
    return []
  }
}
