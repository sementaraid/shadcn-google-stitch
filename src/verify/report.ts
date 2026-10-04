import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { IR } from '../types.ts'
import type { DiffResult, RegionScore } from './diff.ts'

/**
 * `report.html`: what the run scored, where it lost points, and what was patched.
 *
 * Self-contained on purpose — the render and heatmap images are written beside
 * it and referenced relatively, so the whole `.stitch` directory can be opened
 * from disk or dropped in a CI artifact with no server.
 */

export interface IterationRecord {
  index: number
  score: number
  ssim: number
  patches: string[]
  /** Path of this iteration's render, written beside the report. */
  shot: string
  /** Path of this iteration's diff heatmap. */
  heat: string
  diff: DiffResult
}

export interface ReportInput {
  ir: IR
  iterations: IterationRecord[]
  buildLog: string
  ambiguous?: { nodeId: string; candidates: { name: string; score: number }[] }[]
}

export async function writeReport(input: ReportInput, dir?: string): Promise<string> {
  const target = join(dir ?? defaultDir(input), 'report.html')
  await writeFile(target, renderReport(input))
  return target
}

function defaultDir(input: ReportInput): string {
  return join(dirname(input.ir.source.screenshot), '.stitch')
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

const pct = (n: number) => `${(n * 100).toFixed(1)}%`

function renderReport(input: ReportInput): string {
  const { iterations } = input
  const best = iterations.reduce((a, b) => (b.score > a.score ? b : a), iterations[0])
  const last = iterations.at(-1)
  const first = iterations[0]

  const regionRows = (last?.diff.worst ?? [])
    .slice(0, 40)
    .map(
      (r) => `<tr class="${r.score < 0.8 ? 'bad' : r.score < 0.95 ? 'warn' : ''}">
      <td><code>${r.nodeId}</code></td>
      <td>${r.kind}</td>
      <td>${r.box.x},${r.box.y} ${r.box.w}×${r.box.h}</td>
      <td class="num">${pct(r.score)}</td>
      <td class="num">${pct(r.weight).replace('%', '')}%</td>
      <td>${r.mode}</td>
      <td>${esc(r.note ?? '')}</td>
    </tr>`,
    )
    .join('')

  const iterationCards = iterations
    .map((it) => {
      return `<div class="iter">
      <h3>iteration ${it.index} — ${pct(it.score)} <span class="dim">ssim ${it.ssim.toFixed(4)}</span></h3>
      <div class="shots">
        <figure><img src="${rel(it.shot)}" alt="render ${it.index}"><figcaption>render</figcaption></figure>
        <figure><img src="${rel(it.heat)}" alt="heatmap ${it.index}"><figcaption>diff heatmap</figcaption></figure>
      </div>
      ${it.patches.length ? `<ul class="patches">${it.patches.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '<p class="dim">no patches</p>'}
    </div>`
    })
    .join('')

  const lowConfidence = (input.ambiguous ?? [])
    .slice(0, 40)
    .map(
      (a) =>
        `<tr><td><code>${a.nodeId}</code></td><td>${a.candidates.map((c) => `${esc(c.name)} ${c.score.toFixed(2)}`).join(' · ')}</td></tr>`,
    )
    .join('')

  const delta = first && last ? last.diff.score - first.diff.score : 0

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>stitch verify — ${esc(input.ir.source.html)}</title>
<style>
  :root { color-scheme: dark }
  * { box-sizing: border-box }
  body { margin:0; background:#0b0b0e; color:#e5e5e5; font:14px/1.55 ui-sans-serif,system-ui,sans-serif }
  header { padding:20px 24px; border-bottom:1px solid #26262c; position:sticky; top:0; background:#0b0b0e; z-index:5 }
  h1 { margin:0 0 6px; font-size:17px; font-weight:600 }
  h2 { font-size:14px; font-weight:600; margin:28px 24px 10px; color:#a1a1aa; text-transform:uppercase; letter-spacing:.06em }
  h3 { font-size:13px; font-weight:600; margin:0 0 10px }
  .dim { color:#8b8b96; font-weight:400 }
  .scores { display:flex; gap:26px; margin-top:10px }
  .score b { display:block; font-size:26px; font-weight:600 }
  .score span { font-size:12px; color:#8b8b96 }
  .up { color:#4ade80 } .down { color:#f87171 }
  section { padding:0 24px }
  table { border-collapse:collapse; width:100% }
  th,td { text-align:left; padding:5px 10px; border-bottom:1px solid #1d1d22; font-size:12.5px }
  th { color:#8b8b96; font-weight:500; text-transform:uppercase; font-size:11px; letter-spacing:.04em }
  td.num { text-align:right; font-variant-numeric:tabular-nums }
  tr.bad td { background:rgba(248,113,113,.09) }
  tr.warn td { background:rgba(250,204,21,.07) }
  code { font-family:ui-monospace,monospace; font-size:12px; color:#c4b5fd }
  .iter { border:1px solid #26262c; border-radius:10px; padding:14px 16px; margin-bottom:12px; background:#111115 }
  .shots { display:flex; gap:12px; overflow-x:auto }
  figure { margin:0; flex:0 0 auto }
  figure img { display:block; max-height:300px; border:1px solid #26262c; border-radius:6px; background:#fff }
  figcaption { font-size:11px; color:#8b8b96; margin-top:5px }
  .patches { margin:0; padding-left:18px; font-size:12.5px; color:#a1a1aa }
  pre { background:#111115; border:1px solid #26262c; border-radius:8px; padding:12px; overflow:auto; font-size:12px; max-height:320px }
  .empty { color:#8b8b96; font-style:italic }
</style></head>
<body>
<header>
  <h1>stitch verify — ${esc(input.ir.source.html)}</h1>
  <div class="dim">${input.ir.viewport.width}×${input.ir.viewport.height} · ${iterations.length} iteration(s)</div>
  <div class="scores">
    <div class="score"><b>${best ? pct(best.score) : '—'}</b><span>best region score</span></div>
    <div class="score"><b>${best ? best.ssim.toFixed(4) : '—'}</b><span>best ssim</span></div>
    <div class="score"><b class="${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%</b><span>first → last</span></div>
    <div class="score"><b>${last?.diff.regions.length ?? 0}</b><span>regions scored</span></div>
  </div>
</header>

<section>
  <h2>iterations</h2>
  ${iterationCards || '<p class="empty">no iterations ran</p>'}
</section>

<section>
  <h2>regions, worst first</h2>
  ${regionRows ? `<table><thead><tr><th>node</th><th>kind</th><th>box</th><th>score</th><th>weight</th><th>mode</th><th>note</th></tr></thead><tbody>${regionRows}</tbody></table>` : '<p class="empty">nothing scored</p>'}
</section>

${lowConfidence ? `<section><h2>low-confidence nodes</h2><table><thead><tr><th>node</th><th>candidates</th></tr></thead><tbody>${lowConfidence}</tbody></table></section>` : ''}

${input.buildLog.trim() ? `<section><h2>build log</h2><pre>${esc(input.buildLog.slice(-8000))}</pre></section>` : ''}
</body></html>
`
}

function rel(p: string): string {
  const parts = p.split('/')
  return parts[parts.length - 1]
}
