import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Project, SyntaxKind, ts } from 'ts-morph'

/**
 * The emitter writes JSX as text, so the one thing that must never happen is
 * output the parser would read differently than it was written. Parsing the
 * result here turns that from a hope into a check that runs on every emit — and
 * it is also what makes M5's AST patching possible at all.
 *
 * Only *syntactic* diagnostics count. The generated project has no
 * `node_modules` until it is installed, so unresolved imports and the missing
 * `JSX.IntrinsicElements` are expected here and say nothing about the emitter.
 */
export interface CheckResult {
  ok: boolean
  files: string[]
  problems: string[]
}

/** Errors that are about the shape of the code, not about resolving modules. */
export function isSyntactic(d: { getCategory(): number }): boolean {
  return d.getCategory() === ts.DiagnosticCategory.Error
}
export async function parseAndCheck(dir: string): Promise<CheckResult> {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, noResolve: true },
  })

  const files: string[] = []
  const problems: string[] = []
  const generated = join(dir, 'src/components/generated')

  let entries: string[] = []
  try {
    entries = await readdir(generated)
  } catch {
    return { ok: false, files, problems: [`no generated components in ${generated}`] }
  }

  // Syntax-only: ask the parser for a tree and walk it. A file that parsed is a
  // file whose every element, attribute and child the AST agrees with.
  for (const name of [...entries.filter((f) => f.endsWith('.tsx')), '..']) {
    const path = name === '..' ? join(dir, 'src/App.tsx') : join(generated, name)
    const source = project.addSourceFileAtPath(path)
    files.push(source.getBaseName())

    const tree = source.compilerNode
    problems.push(...syntaxErrors(source, tree))

    for (const el of [
      ...source.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
      ...source.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
    ]) {
      const attr = el
        .getAttributes()
        .filter((a): a is import('ts-morph').JsxAttribute => a.getKind() === SyntaxKind.JsxAttribute)
        .find((a) => a.getNameNode().getText() === 'data-stitch-id')
      if (!attr) continue
      const value = attr.getInitializer()
      if (!value || !/^"n\d{4}"$/.test(value.getText())) {
        problems.push(`${source.getBaseName()}: malformed data-stitch-id ${value?.getText() ?? '(none)'}`)
      }
    }
  }

  return { ok: problems.length === 0, files, problems }
}

/**
 * Parse the file the way TypeScript does and keep only grammatical complaints.
 * `transpile` gives the syntactic diagnostics without ever touching the module
 * graph, which is exactly the surface this check is about.
 */
function syntaxErrors(source: { getFilePath(): string; getFullText(): string }, _tree: unknown): string[] {
  const out = ts.transpileModule(source.getFullText(), {
    fileName: source.getFilePath(),
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  })
  const name = source.getFilePath().split('/').pop() ?? 'file'
  return (out.diagnostics ?? [])
    .filter((d) => d.category === ts.DiagnosticCategory.Error)
    .map((d) => `${name}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`)
}
