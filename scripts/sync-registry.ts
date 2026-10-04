/**
 * Vendor the shadcn components and derive their real prop surface.
 *
 *   npm run sync-registry
 *
 * The prop enums come from the actual component source, not from a guess. That
 * matters because the generated code must compile against whatever shadcn
 * shipped: this version's Button has `icon-xs` and `text-primary`, spellings a
 * hand-written list would have missed.
 */
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Node, Project, SyntaxKind, ts } from 'ts-morph'

const ROOT = new URL('..', import.meta.url)
const P = (rel: string) => new URL(rel, ROOT).pathname

const TEMPLATE_UI = P('templates/vite-react-ts/src/components/ui')
const TEMPLATE_LIB = P('templates/vite-react-ts/src/lib')
const OUT_DIR = P('src/registry/shadcn')
const OUT_SRC = join(OUT_DIR, 'components')
const OUT_FILE = join(OUT_DIR, 'index.generated.ts')

await rm(OUT_SRC, { recursive: true, force: true })
await mkdir(OUT_SRC, { recursive: true })

const files = (await readdir(TEMPLATE_UI)).filter((f) => f.endsWith('.tsx')).sort()
if (files.length === 0) throw new Error(`no components in ${TEMPLATE_UI}`)

// Copy the sources verbatim: the generated project needs the real cva tables and
// CSS-variable references, not a paraphrase of them.
await cp(TEMPLATE_UI, OUT_SRC, { recursive: true })
await cp(TEMPLATE_LIB, join(OUT_DIR, 'lib'), { recursive: true })

const project = new Project({
  skipAddingFilesFromTsConfig: true,
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX },
})

/** `button-group` -> `ButtonGroup`. */
const pascal = (kebab: string) =>
  kebab
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join('')

interface VariantAxis {
  prop: string
  options: string[]
  default: string | null
}

interface Entry {
  name: string
  file: string
  importPath: string
  slots: string[]
  variants: VariantAxis[]
  props: string[]
  /** True when the source styles on `data-checked`, i.e. it is a stateful control. */
  stateful: boolean
  deps: string[]
  exports: string[]
}

/**
 * Names reachable by destructuring in a component's parameter list. cva axes
 * arrive through `VariantProps`, so they are not destructured and would be
 * missed here — they come from the `variants` scan instead. Together the two
 * give the full set of props the emitter is allowed to write.
 */
/**
 * Props declared as inline literal unions rather than through cva:
 * `{ size?: "default" | "sm" }`. These matter as much as the cva axes — the
 * emitter must not write `variant` on a component that only has `size`.
 */
function literalUnions(node: Node): VariantAxis[] {
  const out = new Map<string, string[]>()
  const visit = (n: Node) => {
    if (Node.isPropertySignature(n)) {
      const t = n.getTypeNode()
      if (t && Node.isUnionTypeNode(t)) {
        const lits = t.getTypeNodes().map((u) => u.getText()).filter((s) => /^["'].*["']$/.test(s))
        if (lits.length >= 2) {
          out.set(
            n.getName().replace(/^["']|["']$/g, ''),
            lits.map((s) => s.replace(/^["']|["']$/g, '')),
          )
        }
      }
    }
    n.forEachChild(visit)
  }
  node.forEachChild(visit)
  return [...out].map(([prop, options]) => ({ prop, options, default: null }))
}

function destructuredProps(node: Node): string[] {
  const out = new Set<string>()
  for (const param of node.getChildrenOfKind(SyntaxKind.Parameter)) {
    const walk = (n: Node) => {
      if (Node.isObjectBindingPattern(n)) {
        for (const el of n.getElements()) out.add(el.getName().replace(/^["']|["']$/g, ''))
        return
      }
      if (Node.isObjectLiteralExpression(n)) {
        // `{ ...props }: Props` default form is not used here, but a JSX-ish
        // initializer can appear; recursing keeps this from silently missing.
        n.getProperties().forEach(walk)
      }
    }
    walk(param.getNameNode())
  }
  return [...out].filter((p) => p !== '...').sort()
}

const entries: Entry[] = []

for (const file of files) {
  const source = project.addSourceFileAtPath(join(OUT_SRC, file))
  const base = file.replace(/\.tsx$/, '')

  const exports = source
    .getExportSymbols()
    .map((s) => s.getName())
    .filter((n) => n !== 'default')

  // The component everyone means when they say "the button".
  const primary =
    exports.find((n) => n === pascal(base)) ??
    exports.find((n) => !n.endsWith('Variants') && !n.startsWith('use')) ??
    pascal(base)

  const slots = new Set<string>()
  for (const m of source.getFullText().matchAll(/data-slot=["']([^"']+)["']/g)) slots.add(m[1])

  const variants: VariantAxis[] = []
  for (const call of source.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getText() !== 'cva') continue
    const config = call.getArguments()[1]
    if (!config || !Node.isObjectLiteralExpression(config)) continue

    const variantsProp = config.getProperty('variants')
    if (!variantsProp || !Node.isPropertyAssignment(variantsProp)) continue
    const groups = variantsProp.getInitializer()
    if (!groups || !Node.isObjectLiteralExpression(groups)) continue

    for (const group of groups.getProperties()) {
      if (!Node.isPropertyAssignment(group)) continue
      const axis = group.getInitializer()
      if (!axis || !Node.isObjectLiteralExpression(axis)) continue
      variants.push({
        prop: group.getName().replace(/^["']|["']$/g, ''),
        options: axis
          .getProperties()
          .filter(Node.isPropertyAssignment)
          .map((p) => p.getName().replace(/^["']|["']$/g, '')),
        default: null,
      })
    }

    const defaults = config.getProperty('defaultVariants')
    if (defaults && Node.isPropertyAssignment(defaults)) {
      const init = defaults.getInitializer()
      if (init && Node.isObjectLiteralExpression(init)) {
        for (const p of init.getProperties()) {
          if (!Node.isPropertyAssignment(p)) continue
          const name = p.getName().replace(/^["']|["']$/g, '')
          const val = p.getInitializer()
          const axis = variants.find((v) => v.prop === name)
          if (axis && val) axis.default = val.getText().replace(/^["']|["']$/g, '')
        }
      }
    }
  }

  const deps = source
    .getImportDeclarations()
    .map((d) => d.getModuleSpecifierValue())
    .filter((m) => !m.startsWith('.') && !m.startsWith('@/'))
    .sort()

  // A control that styles on `data-checked` takes its on/off state through the
  // uncontrolled prop. Radix declares `checked` as a boolean, not a literal
  // union, so the type scanner cannot see it — this is the honest proxy.
  const stateful = /data-checked|data-\[state=checked\]/.test(source.getFullText())

  // The prop list belongs to the component the emitter will render, so read it
  // off that declaration rather than from every function in the file.
  const decl =
    source.getFunction(primary) ??
    source.getVariableDeclaration(primary) ??
    source.getDescendantsOfKind(SyntaxKind.FunctionDeclaration).find((f) => f.getName() === primary) ??
    source
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((v) => v.getName() === primary)

  const props =
    decl && Node.isFunctionDeclaration(decl)
      ? destructuredProps(decl)
      : decl && Node.isVariableDeclaration(decl)
        ? (() => {
            const init = decl.getInitializer()
            return init && Node.isArrowFunction(init) ? destructuredProps(init) : []
          })()
        : []

  // Literal unions live on the component itself. Merge them in, and pick up the
  // `size = "sm"` default from the destructuring, which cva's defaultVariants
  // never covers.
  if (decl) {
    for (const axis of literalUnions(decl)) {
      if (variants.some((v) => v.prop === axis.prop)) continue
      const bind = decl
        .getDescendantsOfKind(SyntaxKind.BindingElement)
        .find((b) => b.getName() === axis.prop)
      const init = bind?.getInitializer()
      if (init) axis.default = init.getText().replace(/^["']|["']$/g, '')
      variants.push(axis)
    }
  }

  entries.push({
    name: primary,
    file,
    importPath: `@/components/ui/${base}`,
    slots: [...slots].sort(),
    variants,
    props,
    stateful,
    deps,
    exports: [...exports].sort(),
  })
}

const body = `// GENERATED by scripts/sync-registry.ts — do not edit.
// Vendored from templates/vite-react-ts (${files.length} components).

export interface VariantAxis {
  prop: string
  options: string[]
  default: string | null
}

export interface ComponentEntry {
  name: string
  file: string
  importPath: string
  slots: string[]
  variants: VariantAxis[]
  props: string[]
  /** Styles on `data-checked` — an on/off control. */
  stateful: boolean
  deps: string[]
  exports: string[]
}

export const SHADCN: Record<string, ComponentEntry> = ${JSON.stringify(
  Object.fromEntries(entries.map((e) => [e.name, e])),
  null,
  2,
)}
`

await writeFile(OUT_FILE, body)

const withVariants = entries.filter((e) => e.variants.length)
console.log(`${entries.length} components → ${OUT_FILE}`)
console.log(`${withVariants.length} expose variants`)
const b = entries.find((e) => e.name === 'Button')
if (b) {
  console.log(`\nButton: ${b.variants.map((v) => `${v.prop}=[${v.options.join('|')}]`).join(' ')}`)
  console.log(`  slots: ${b.slots.join(', ')}`)
  console.log(`  deps:  ${b.deps.join(', ')}`)
}
