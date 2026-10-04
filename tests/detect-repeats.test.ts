import assert from 'node:assert/strict'
import { detectRepeats } from '../src/extract.ts'
import type { NodeIR, StyleSubset } from '../src/types.ts'

const style = { display: 'flex', flexDirection: 'row' } as StyleSubset

function node(id: string, parent: string | null, children: string[], w = 300, h = 200): NodeIR {
  return {
    id, path: id, tag: 'div', classList: [], role: null, ariaLabel: null, placeholder: null, text: null,
    textAt: null,
    box: { x: 0, y: 0, w, h }, style, children, parent, depth: 0,
    visible: true, kind: 'container', repeat: null, isLeafOpaque: false, iconShape: null, ligature: null, cropPath: null,
  }
}

// three identical siblings under one parent → one repeat group of 3
{
  const nodes: Record<string, NodeIR> = {
    root: node('root', null, ['a', 'b', 'c']),
    a: node('a', 'root', []), b: node('b', 'root', []), c: node('c', 'root', []),
  }
  detectRepeats(nodes)
  assert.equal(nodes.a.repeat?.count, 3, 'identical siblings group')
  assert.deepEqual(nodes.a.repeat?.siblingIds, ['a', 'b', 'c'])
  assert.equal(nodes.root.repeat, null, 'parent is not itself a repeat')
}

// same shape under two different parents → coincidence, no group
{
  const nodes: Record<string, NodeIR> = {
    r1: node('r1', null, ['a']), r2: node('r2', null, ['b']),
    a: node('a', 'r1', []), b: node('b', 'r2', []),
  }
  detectRepeats(nodes)
  assert.equal(nodes.a.repeat, null, 'non-siblings do not group')
}

// heights differ (common in a flex row) → still the same shape
{
  const nodes: Record<string, NodeIR> = {
    root: node('root', null, ['a', 'b']),
    a: node('a', 'root', [], 300, 200), b: node('b', 'root', [], 300, 240),
  }
  detectRepeats(nodes)
  assert.equal(nodes.a.repeat?.count, 2, 'height is not part of the shape')
}

// widths past the 16px bucket → different shapes
{
  const nodes: Record<string, NodeIR> = {
    root: node('root', null, ['a', 'b']),
    a: node('a', 'root', [], 200, 200), b: node('b', 'root', [], 400, 200),
  }
  detectRepeats(nodes)
  assert.equal(nodes.a.repeat, null, 'width bucket mismatch breaks the shape')
}

// widths inside the same 16px bucket → same shape
{
  const nodes: Record<string, NodeIR> = {
    root: node('root', null, ['a', 'b']),
    a: node('a', 'root', [], 314, 200), b: node('b', 'root', [], 317, 200),
  }
  detectRepeats(nodes)
  assert.equal(nodes.a.repeat?.count, 2, 'near-equal widths still group')
}

// nested repeats: outer group and inner group coexist
{
  const nodes: Record<string, NodeIR> = {
    root: node('root', null, ['c1', 'c2']),
    c1: node('c1', 'root', ['i1']), c2: node('c2', 'root', ['i2']),
    i1: node('i1', 'c1', [], 100, 40), i2: node('i2', 'c2', [], 100, 40),
  }
  detectRepeats(nodes)
  assert.equal(nodes.c1.repeat?.count, 2, 'outer repeats group')
  assert.equal(nodes.i1.repeat, null, 'inner nodes have different parents')
}

console.log('detect-repeats: ok')
