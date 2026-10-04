import { readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { ingest } from './ingest.ts'
import { extract } from './extract.ts'
import { ambiguous, classify, interiorOf } from './classify/classify.ts'
import { SHADCN } from './registry/shadcn/index.generated.ts'
import type { Classification, IR, NodeIR } from './types.ts'
import type { Ingested } from './ingest.ts'

interface Label {
  label: string
  tag: string
  box: { x: number; y: number; w: number; h: number }
}

/**
 * Ground truth lives in the fixture as a `stitch-node` attribute. It is read
 * here through the page, never through the IR: the walker does not capture that
 * attribute, so the classifier is provably blind to the answers.
 */
async function readLabels(ing: Ingested): Promise<Label[]> {
  return ing.page.evaluate(() =>
    Array.from(document.querySelectorAll('[stitch-node]')).map((el) => {
      const r = el.getBoundingClientRect()
      return {
        label: el.getAttribute('stitch-node') ?? '',
        tag: el.tagName.toLowerCase(),
        box: { x: r.x, y: r.y, w: r.width, h: r.height },
      }
    }),
  )
}

const near = (a: number, b: number) => Math.abs(a - b) <= 0.5

function findNode(ir: IR, label: Label): NodeIR | null {
  for (const n of Object.values(ir.nodes)) {
    if (n.tag !== label.tag) continue
    if (near(n.box.x, label.box.x) && near(n.box.y, label.box.y) && near(n.box.w, label.box.w)) return n
  }
  return null
}

export interface FixtureResult {
  name: string
  labels: number
  matched: number
  truePositives: number
  falsePositives: number
  falseNegatives: number
  negativeViolations: string[]
  mismatches: string[]
  ambiguous: number
}

async function runFixture(htmlPath: string, pngPath: string): Promise<FixtureResult> {
  const ing = await ingest(htmlPath, pngPath, { deviceScaleFactor: 1 })
  try {
    const ir = await extract(ing)
    const classes = classify(ir)
    const labels = await readLabels(ing)

    const result: FixtureResult = {
      name: basename(htmlPath),
      labels: labels.length,
      matched: 0,
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0,
      negativeViolations: [],
      mismatches: [],
      ambiguous: ambiguous(classes, interiorOf(ir.nodes, classes)).length,
    }

    for (const label of labels) {
      const node = findNode(ir, label)
      if (!node) {
        result.mismatches.push(`${label.label}: no IR node for that box (${Math.round(label.box.w)}×${Math.round(label.box.h)})`)
        continue
      }
      result.matched++

      const c: Classification | undefined = classes.get(node.id)
      const [wantComponent, wantVariant] = label.label.split('.')

      if (wantComponent === 'NEG') {
        if (c?.component) {
          result.negativeViolations.push(`${label.label} (${node.id}) wrongly classified as ${c.component}:${c.score.toFixed(2)}`)
          result.falsePositives++
        }
        continue
      }

      if (c?.component === wantComponent) {
        result.truePositives++
        // `Button.Icon` labels the size, `Badge.Outline` the variant. Accept the
        // label matching any variant field rather than assuming which.
        if (wantVariant) {
          const want = wantVariant.toLowerCase()

          // Checked-ness is state, not an enum: it is writable only through the
          // uncontrolled prop, so assert that rather than membership in a list.
          if (want === 'checked' || want === 'unchecked') {
            const on = c.variants.defaultChecked === 'true'
            if (on !== (want === 'checked')) {
              result.mismatches.push(
                `${label.label} (${node.id}) defaultChecked ${on} != ${want === 'checked'}`,
              )
            }
            continue
          }

          // Compare effective props, defaults included. The classifier omits a
          // prop equal to the component's default because React applies it
          // anyway, so `{}` on a Button really is variant=default size=default.
          const axis = SHADCN[wantComponent]?.variants ?? []
          const effective = axis
            .map((a) => c.variants[a.prop] ?? a.default)
            .filter((v): v is string => v !== null)

          if (effective.length && !effective.some((v) => v.toLowerCase() === want)) {
            result.mismatches.push(`${label.label} (${node.id}) variants ${effective.join('/')} != ${want}`)
          }
        }
      } else if (c?.component) {
        result.falsePositives++
        result.falseNegatives++
        result.mismatches.push(`${label.label} (${node.id}) got ${c.component}:${c.score.toFixed(2)}, want ${wantComponent}`)
      } else {
        result.falseNegatives++
        const top = c?.candidates?.[0]
        result.mismatches.push(
          `${label.label} (${node.id}) unclassified${top ? ` — best ${top.name}:${top.score.toFixed(2)}` : ''}`,
        )
      }
    }

    return result
  } finally {
    await ing.close()
  }
}

export async function evalDir(dir: string): Promise<boolean> {
  const entries = await readdir(dir)
  const htmls = entries.filter((e) => e.endsWith('.html'))

  if (htmls.length === 0) {
    console.error(`no .html fixtures in ${dir}`)
    return false
  }

  let tp = 0
  let fp = 0
  let fn = 0
  let violations = 0
  let labels = 0

  for (const html of htmls) {
    const png = html.replace(/\.html$/, '.png')
    if (!entries.includes(png)) {
      console.error(`${html}: no matching ${png}, skipping`)
      continue
    }

    const r = await runFixture(join(dir, html), join(dir, png))
    labels += r.labels
    tp += r.truePositives
    fp += r.falsePositives
    fn += r.falseNegatives
    violations += r.negativeViolations.length

    const seen = r.truePositives + r.falseNegatives
    const acc = seen ? ((r.truePositives / seen) * 100).toFixed(0) : '—'
    console.error(`\n${r.name}: ${r.truePositives}/${seen} labelled components (${acc}%), ${r.ambiguous} ambiguous, ${r.labels} labels`)

    for (const m of r.mismatches) console.error(`  miss  ${m}`)
    for (const v of r.negativeViolations) console.error(`  NEG   ${v}`)
  }

  const precision = tp + fp ? tp / (tp + fp) : 1
  const recall = tp + fn ? tp / (tp + fn) : 1

  console.error(`\nprecision ${(precision * 100).toFixed(1)}%  recall ${(recall * 100).toFixed(1)}%`)
  console.error(`tp ${tp}  fp ${fp}  fn ${fn}  labels ${labels}  negative violations ${violations}`)

  // Negative fixtures are the ones that keep this honest: a scorer that accepts
  // everything scores great on positives and fails here.
  const ok = recall >= 0.8 && precision >= 0.8 && violations === 0
  console.error(ok ? 'PASS' : 'FAIL')
  return ok
}
