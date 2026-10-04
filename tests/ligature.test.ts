import assert from 'node:assert/strict'
import { promoteLigatureIcons } from '../src/extract.ts'
import type { NodeIR } from '../src/types.ts'

function node(id: string, text: string | null, fontFamily: string, kind: NodeIR['kind'] = 'text'): NodeIR {
  return {
    id, path: id, tag: 'span', classList: [], role: null, ariaLabel: null, placeholder: null,
    text, textAt: 0, box: { x: 0, y: 0, w: 15, h: 15 },
    style: { fontFamily } as NodeIR['style'], children: [], parent: null, depth: 0,
    visible: true, kind, repeat: null, isLeafOpaque: false, iconShape: null, ligature: null, cropPath: null,
  }
}

const ICON = '"Material Symbols Outlined"'
const BODY = '"Plus Jakarta Sans"'

// A ligature word in an icon font is an icon the DOM reports as text. It must
// come back as an icon, with its name — otherwise the emitter writes the word
// `gavel` into the page and the browser draws eight letters 36px wide where a
// 14px glyph belongs, shoving every sibling in the row.
{
  const nodes = { n1: node('n1', 'gavel', ICON) }
  assert.equal(promoteLigatureIcons(nodes), 1)
  assert.equal(nodes.n1.kind, 'icon')
  assert.equal(nodes.n1.ligature, 'Gavel')
}

// A name that is not a Lucide export but has an honest counterpart.
{
  const nodes = { n1: node('n1', 'location_on', ICON) }
  promoteLigatureIcons(nodes)
  assert.equal(nodes.n1.ligature, 'MapPin')
}

// The same word in a body font is *text*, not an icon. This is the guard that
// keeps a line of prose containing the word "search" from becoming an icon.
{
  const nodes = { n1: node('n1', 'search', BODY) }
  assert.equal(promoteLigatureIcons(nodes), 0)
  assert.equal(nodes.n1.kind, 'text')
  assert.equal(nodes.n1.ligature, null)
}

// An icon font can also draw a real ligature: two letters the font merges
// (`fi`). That is text, not an icon, and must survive as text.
{
  const nodes = { n1: node('n1', 'fi', ICON) }
  assert.equal(promoteLigatureIcons(nodes), 0)
}

// A word with no Lucide counterpart stays a literal rather than becoming a
// plausible-looking wrong icon.
{
  const nodes = { n1: node('n1', 'not_a_real_symbol_xyz', ICON) }
  assert.equal(promoteLigatureIcons(nodes), 0)
  assert.equal(nodes.n1.kind, 'text')
}

// An element that already owns children is a container that happens to sit in
// an icon font; only a leaf is a glyph.
{
  const parent = node('n1', 'gavel', ICON)
  parent.children = ['n2']
  const nodes = { n1: parent, n2: node('n2', null, ICON) }
  promoteLigatureIcons(nodes)
  assert.equal(nodes.n1.kind, 'text', 'has children, so not a leaf glyph')
}
