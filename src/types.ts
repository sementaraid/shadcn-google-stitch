export type Kind = 'container' | 'text' | 'image' | 'icon' | 'illustration' | 'control'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface StyleSubset {
  display: string
  position: string
  flexDirection: string
  alignItems: string
  justifyContent: string
  gap: string
  width: string
  height: string
  padding: string
  margin: string
  borderRadius: string
  borderWidth: string
  borderColor: string
  background: string
  backgroundColor: string
  color: string
  fontSize: string
  fontWeight: string
  fontFamily: string
  lineHeight: string
  letterSpacing: string
  boxShadow: string
  opacity: string
  overflow: string
  cursor: string
  zIndex: string
  gridTemplateColumns: string
}

export interface RepeatInfo {
  count: number
  siblingIds: string[]
}

/** `[tagName, attributes]`, the shape Lucide ships its icon data in. */
export type IconChild = [string, Record<string, string>]

export interface IconShape {
  viewBox: string
  className: string | null
  children: IconChild[]
}

/**
 * Families whose glyphs are icon ligatures, never body type. Shared because two
 * stages need opposite halves of the same fact: extract promotes their text into
 * icons, and codegen keeps them out of the emitted `<link>` and the font tokens.
 */
export const ICON_FONT = /symbols|icons?\b/i

export type IconMatch =
  | { via: 'class'; name: string; confidence: number }
  | { via: 'pathHash'; name: string; confidence: number }
  | { via: 'fuzzy'; name: string; confidence: number; candidates: string[] }
  | { via: 'ligature'; name: string; confidence: number } // an icon font's word, no geometry
  | { via: 'none'; candidates: string[] }

export interface Candidate {
  name: string
  score: number
  variants: Record<string, string>
  evidence: string[]
}

export interface Classification {
  nodeId: string
  component: string | null
  score: number
  variants: Record<string, string>
  evidence: string[]
  candidates: Candidate[]
  icon?: IconMatch
}

export interface NodeIR {
  id: string
  path: string
  tag: string
  classList: string[]
  role: string | null
  ariaLabel: string | null
  /** An `<input>`'s placeholder is visible text and the pixel diff measures it. */
  placeholder: string | null
  text: string | null
  /**
   * Where this node's own text sits among its element children: `0` before all
   * of them, `n` after all of them. The IR keeps text and children in separate
   * lists, and without this an icon-then-label (`<svg/>Overview`) emits as
   * `Overview<svg/>` — same content, mirrored layout.
   */
  textAt: number | null
  box: Box
  style: StyleSubset
  children: string[]
  parent: string | null
  depth: number
  visible: boolean
  kind: Kind
  repeat: RepeatInfo | null
  isLeafOpaque: boolean
  /** Present only on `svg` elements; `null` elsewhere. */
  iconShape: IconShape | null
  /**
   * An icon drawn by an icon *font* rather than an `<svg>`: the source paints it
   * by ligature name (`material-symbols-outlined` holding `gavel`), so there is
   * no geometry to match. Holds the Lucide name decided at extract time.
   */
  ligature: string | null
  cropPath: string | null
}

export interface FontUsage {
  family: string
  weights: number[]
  count: number
  heading: boolean
}

export interface IR {
  source: { html: string; screenshot: string }
  viewport: { width: number; height: number }
  colors: { value: string; count: number; area: number }[]
  fonts: FontUsage[]
  fontSubstituted: string[]
  nodes: Record<string, NodeIR>
  root: string
}

export interface Config {
  out: string
  stack: 'vite-react-ts'
  offline: boolean
  maxIter: number
  debugIr: boolean
  deviceScaleFactor: number
}
