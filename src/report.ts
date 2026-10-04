import { mkdir, writeFile, copyFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { Classification, IR, Kind, NodeIR } from './types.ts'

const KIND_COLOR: Record<Kind, string> = {
  container: '#3b82f6',
  text: '#22c55e',
  image: '#f97316',
  icon: '#a855f7',
  illustration: '#ec4899',
  control: '#eab308',
}

export interface Artifacts {
  dir: string
  irJson: string
  viewer: string
  screenshot: string
}

export async function writeArtifacts(ir: IR, outDir: string, screenshotPath: string): Promise<Artifacts> {
  await mkdir(outDir, { recursive: true })

  const irJson = join(outDir, 'ir.json')
  await writeFile(irJson, JSON.stringify(ir, null, 2))

  const shotName = basename(screenshotPath)
  const shotDest = join(outDir, shotName)
  await copyFile(screenshotPath, shotDest)

  const viewer = join(outDir, 'viewer.html')
  await writeFile(viewer, renderViewer(ir, shotName))

  return { dir: outDir, irJson, viewer, screenshot: shotDest }
}

export async function writeClassifications(
  classes: Map<string, Classification>,
  ambiguousList: Classification[],
  outDir: string,
): Promise<string> {
  const path = join(outDir, 'classify.json')
  await writeFile(
    path,
    JSON.stringify(
      {
        nodes: Object.fromEntries(classes),
        ambiguous: ambiguousList.map((c) => c.nodeId),
      },
      null,
      2,
    ),
  )
  return path
}

function renderViewer(ir: IR, shotName: string): string {
  const nodes = Object.values(ir.nodes).sort((a, b) => a.depth - b.depth)
  const counts = nodes.reduce<Record<string, number>>((acc, n) => {
    acc[n.kind] = (acc[n.kind] ?? 0) + 1
    return acc
  }, {})

  const legend = (Object.keys(KIND_COLOR) as Kind[])
    .map((k) => `<span class="key"><i style="background:${KIND_COLOR[k]}"></i>${k} ${counts[k] ?? 0}</span>`)
    .join('')

  const boxes = nodes
    .filter((n) => n.visible)
    .map((n) => {
      const opacity = n.kind === 'container' ? 0.35 : 0.8
      return `<div class="box" data-id="${n.id}"
        style="left:${n.box.x}px;top:${n.box.y}px;width:${n.box.w}px;height:${n.box.h}px;
               border-color:${KIND_COLOR[n.kind]};opacity:${opacity}"
        title="${n.id} ${n.tag} · ${n.kind}${n.repeat ? ` · ×${n.repeat.count}` : ''}"></div>`
    })
    .join('')

  const rows = nodes
    .filter((n) => n.visible)
    .slice(0, 400)
    .map(row)
    .join('')

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>IR viewer</title>
<style>
  :root { color-scheme: dark }
  body { margin:0; background:#0b0b0e; color:#e5e5e5; font:13px/1.5 ui-monospace,monospace }
  header { padding:12px 16px; border-bottom:1px solid #26262c; position:sticky; top:0; background:#0b0b0e; z-index:10 }
  .key { margin-right:14px; white-space:nowrap }
  .key i { display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:5px }
  .stage { position:relative; margin:16px; width:${ir.viewport.width}px }
  .stage img { display:block; width:${ir.viewport.width}px }
  .box { position:absolute; border:1px solid; pointer-events:auto; box-sizing:border-box }
  .box:hover { background:rgba(255,255,255,.08) }
  table { border-collapse:collapse; width:100%; margin-top:8px }
  th,td { text-align:left; padding:3px 8px; border-bottom:1px solid #1e1e24; white-space:nowrap }
  th { color:#8b8b96; font-weight:400 }
  .k { padding:1px 6px; border-radius:3px; color:#0b0b0e }
  details { margin:16px } summary { cursor:pointer; color:#8b8b96 }
  ${ir.fontSubstituted.length ? '' : ''}
</style></head>
<body>
<header>
  ${legend}
  <span class="key" style="color:#8b8b96">${nodes.length} nodes · ${ir.viewport.width}×${ir.viewport.height}</span>
  ${ir.fontSubstituted.length
    ? `<div style="color:#f97316;margin-top:6px">font not resolved: ${ir.fontSubstituted.join(', ')} — text diff will be downweighted</div>`
    : ''}
</header>
<div class="stage"><img src="${shotName}" alt="">${boxes}</div>
<details open><summary>nodes</summary>
<table><thead><tr><th>id</th><th>tag</th><th>kind</th><th>box</th><th>text</th><th>repeat</th></tr></thead>
<tbody>${rows}</tbody></table>
</details>
</body></html>`
}

function row(n: NodeIR): string {
  const text = n.text ? esc(n.text.slice(0, 60)) : ''
  return `<tr><td>${n.id}</td><td>${esc(n.tag)}</td>
    <td><span class="k" style="background:${KIND_COLOR[n.kind]}">${n.kind}</span></td>
    <td>${n.box.w}×${n.box.h} @ ${n.box.x},${n.box.y}</td>
    <td>${text}</td><td>${n.repeat ? `×${n.repeat.count}` : ''}</td></tr>`
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
