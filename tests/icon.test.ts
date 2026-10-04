import assert from 'node:assert/strict'
import { matchIcon } from '../src/classify/icon.ts'
import { canonicalName, toPascal } from '../src/classify/icon.ts'
import type { IconChild } from '../src/types.ts'

function shape(children: IconChild[], className: string | null = null) {
  return { viewBox: '0 0 24 24', className, children }
}

// rung 1 — the class Lucide and shadcn both emit
{
  const m = matchIcon(shape([['path', { d: 'M5 12h14' }]], 'lucide lucide-arrow-right'))
  assert.deepEqual(m, { via: 'class', name: 'ArrowRight', confidence: 1 })
}

// rung 2 — exact shape, no class present
{
  const m = matchIcon(
    shape([
      ['path', { d: 'M5 12h14' }],
      ['path', { d: 'm12 5 7 7-7 7' }],
    ]),
  )
  assert.equal(m.via, 'pathHash', 'exact geometry hashes to a name')
  assert.equal(m.name, 'ArrowRight')
}

// rung 2 survives reformatting: attribute order, sibling order, numeric padding
{
  const m = matchIcon(
    shape([
      ['path', { d: 'm12 5.0000 7 7.00-7 7' }],
      ['path', { d: 'M5 12h14' }],
    ]),
  )
  assert.equal(m.via, 'pathHash', 'normalization absorbs reorder and float noise')
  assert.equal(m.name, 'ArrowRight')
}

// rung 3 — a modified icon still proposes a ranked shortlist, never a verdict
{
  const m = matchIcon(
    shape([
      ['path', { d: 'M5 12h14' }],
      ['path', { d: 'm12 5 7 7-7 7' }],
      ['path', { d: 'M19 19h2' }],
    ]),
  )
  assert.equal(m.via, 'fuzzy', 'near-miss geometry goes to review')
  if (m.via === 'fuzzy') {
    assert.ok(m.candidates.length > 0 && m.candidates.length <= 5, 'shortlist stays short')
    assert.ok(m.confidence < 1, 'fuzzy is never certain')
  }
}

// rung 5 — nothing drawable to rank. A brand mark never gets here: the 24x24
// viewBox gate upstream classifies it as an illustration and skips the ladder.
{
  const m = matchIcon(shape([]))
  assert.deepEqual(m, { via: 'none', candidates: [] })
}

// names resolve through Lucide's own rename table
{
  assert.equal(canonicalName('AlertTriangle'), 'TriangleAlert')
  assert.equal(canonicalName('ArrowRight'), 'ArrowRight')
  assert.equal(canonicalName('NotAnIconAtAll'), null)
  assert.equal(toPascal('arrow-down-0-1'), 'ArrowDown01')
}

console.log('icon: ok')
