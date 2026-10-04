import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  Node,
  Project,
  SyntaxKind,
  type JsxAttributedNode,
  type JsxElement,
  type JsxSelfClosingElement,
} from 'ts-morph'
import type { NodeIR } from '../types.ts'
import type { RegionScore } from './diff.ts'

/**
 * Patching a region is an edit to one node in the generated AST, never a
 * regenerate. Regenerating from the IR would discard every node the loop has
 * already got right, which is the mistake this whole stage exists to avoid.
 *
 * The generated files are JSX *text* the emitter wrote and `ts-morph` re-parses,
 * so a node is found by the `data-stitch-id` attribute it carries and edited in
 * place. What gets written is only ever a `className` — the emitter's own
 * vocabulary, so a patch cannot introduce a prop the component does not take.
 */

export interface PatchResult {
  nodeId: string
  file: string
  note: string
}

/** Where a node's element lives. */
interface Located {
  file: string
  element: JsxElement | JsxSelfClosingElement
}

export class AstPatcher {
  private project: Project
  private dir: string

  constructor(dir: string) {
    this.dir = dir
    this.project = new Project({
      // Parsing only: resolving imports would pull the whole template's types in
      // and cost more than the patch is worth.
      compilerOptions: { jsx: 4 /* preserve */, allowJs: true, noResolve: true },
    })
  }

  async load(): Promise<void> {
    const dir = join(this.dir, 'src', 'components', 'generated')
    const files = (await readdir(dir)).filter((f) => f.endsWith('.tsx')).map((f) => join(dir, f))
    files.push(join(this.dir, 'src', 'App.tsx'))
    for (const f of files) this.project.addSourceFileAtPath(f)
  }

  /** The element carrying `data-stitch-id="<id>"`, wherever in the generated tree it is. */
  private find(nodeId: string): Located | null {
    for (const sf of this.project.getSourceFiles()) {
      for (const attr of sf.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
        if (attr.getNameNode().getText() !== 'data-stitch-id') continue
        if (attr.getInitializer()?.getText().replace(/["']/g, '') !== nodeId) continue
        // `<El data-stitch-id="…">` — the attribute sits at `El > JsxAttributes >
        // JsxAttribute`, and the node above that is the *opening* element for a
        // paired tag and the self-closing element for a bare one. Walking up to
        // whichever of the two is the element is what makes a paired `<div>` (and
        // so almost every patchable node) findable at all.
        const owner = attr.getParent()?.getParent()
        if (!owner) continue
        const element = Node.isJsxOpeningElement(owner) ? owner.getParent() : owner
        if (!element) continue
        if (!Node.isJsxElement(element) && !Node.isJsxSelfClosingElement(element)) continue
        return { file: sf.getFilePath(), element }
      }
    }
    return null
  }

  /**
   * Move a region toward where the reference measured it.
   *
   * This is the patch the loop can always make: the IR holds a box the node was
   * *supposed* to occupy — measured off the real page — and the render reports
   * where it actually landed. The delta is geometry, not a guess, so writing it
   * as an offset is deterministic. Only applied when the drift is more than a
   * pixel or two, or the loop would chatter.
   */
  async patchGeometry(nodeId: string, region: RegionScore, ir: Record<string, NodeIR>): Promise<PatchResult | null> {
    const node = ir[nodeId]
    if (!node || !region.rendered) return null
    // Only in-flow nodes. An absolutely positioned or fixed node is placed by its
    // own offsets, so its rendered box already carries them and the delta below
    // would be zero-plus-drift — the loop would rewrite classes every round
    // without converging on anything.
    if (node.style.position !== 'static' && node.style.position !== 'relative') return null
    const dx = Math.round(node.box.x - region.rendered.x)
    const dy = Math.round(node.box.y - region.rendered.y)
    const dw = Math.round(node.box.w - region.rendered.w)
    const dh = Math.round(node.box.h - region.rendered.h)
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2 && Math.abs(dw) < 2 && Math.abs(dh) < 2) return null

    const found = this.find(nodeId)
    if (!found) return null
    // A slotted node's className is a prop reference (`className={class2}`) shared
    // by every instance of a repeat. Overwriting it would drop the prop and shift
    // all the copies at once, so its classes are not this patcher's to rewrite.
    const classes = this.classesOf(found)
    if (classes === null) return null

    const next = [...classes]
    const set = (prefix: RegExp, value: string) => {
      const i = next.findIndex((c) => prefix.test(c))
      if (i >= 0) next[i] = value
      else next.push(value)
    }
    // Position drift is an offset from where flow put it; size drift is a size.
    // Both are relative, so a second pass that lands correctly writes zero and
    // the `Math.abs(...) < 2` guard above stops the loop from touching it again.
    if (Math.abs(dx) >= 2) set(/^(translate-x-|-?ml-|left-)/, `translate-x-[${dx}px]`)
    if (Math.abs(dy) >= 2) set(/^(translate-y-|-?mt-|top-)/, `translate-y-[${dy}px]`)
    if (Math.abs(dw) >= 2) set(/^w-/, `w-[${node.box.w}px]`)
    if (Math.abs(dh) >= 2) set(/^h-/, `h-[${node.box.h}px]`)

    this.writeClass(found, next)
    return { nodeId, file: found.file, note: `geometry: x${dx >= 0 ? '+' : ''}${dx} y${dy >= 0 ? '+' : ''}${dy} w${dw >= 0 ? '+' : ''}${dw} h${dh >= 0 ? '+' : ''}${dh}` }
  }

  /** Replace a node's classes wholesale. The one write a patch is allowed to make. */
  async setClass(nodeId: string, className: string): Promise<PatchResult | null> {
    const found = this.find(nodeId)
    if (!found) return null
    this.writeClass(found, className.split(/\s+/).filter(Boolean))
    return { nodeId, file: found.file, note: `class="${className}"` }
  }

  /** The element's current classes, `null` when the className is not a plain string. */
  private classesOf(found: Located): string[] | null {
    const attr = this.attributesOf(found).find((a) => Node.isJsxAttribute(a) && a.getNameNode().getText() === 'className')
    if (!attr || !Node.isJsxAttribute(attr)) return []
    const init = attr.getInitializer()
    if (!init) return []
    // A JSX expression (`{class2}`) is a prop reference, not a literal.
    if (!Node.isStringLiteral(init)) return null
    return init.getLiteralText().split(/\s+/).filter(Boolean)
  }

  private writeClass(found: Located, classes: string[]): void {
    const node = this.attributedOf(found)
    const existing = node.getAttributes().find((a) => Node.isJsxAttribute(a) && a.getNameNode().getText() === 'className')
    if (existing) existing.remove()
    node.addAttribute({ name: 'className', initializer: `"${classes.join(' ')}"` })
  }

  /** `JsxElement` (the pair) and `JsxSelfClosingElement` both attribute nodes, but
   *  don't share a type in ts-morph's surface — the opening element carries them. */
  private attributedOf(found: Located): JsxAttributedNode {
    const el = found.element
    return (Node.isJsxElement(el) ? el.getOpeningElement() : el) as unknown as JsxAttributedNode
  }

  private attributesOf(found: Located) {
    return this.attributedOf(found).getAttributes()
  }

  /** Flush one file's edits; the loop calls this between iterations. */
  async save(): Promise<string[]> {
    const written: string[] = []
    for (const sf of this.project.getSourceFiles()) {
      if (!sf.isSaved()) {
        await writeFile(sf.getFilePath(), sf.getFullText())
        written.push(sf.getFilePath())
      }
    }
    return written
  }

  /** Re-parse the file a patch landed in, so the next patch sees the edit. */
  async reload(file: string): Promise<void> {
    const text = await readFile(file, 'utf8')
    const sf = this.project.getSourceFile(file)
    if (sf) sf.replaceWithText(text)
  }
}
