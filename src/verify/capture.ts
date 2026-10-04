import { spawn } from 'node:child_process'
import { existsSync, createReadStream } from 'node:fs'
import { symlink } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { chromium, type Browser } from 'playwright'
import type { IR } from '../types.ts'
import { TEMPLATE } from '../codegen/project.ts'

/**
 * Build the generated project and shoot it at the reference's own dimensions.
 *
 * The viewport and DPR are the reference's, never a default: the comparison is
 * only meaningful at the size the source page was measured at.
 */

export interface BuildResult {
  ok: boolean
  /** Combined stdout+stderr, kept for the report when a build fails. */
  log: string
}

export async function buildProject(dir: string): Promise<BuildResult> {
  await ensureModules(dir)
  const { code, log } = await run('npx', ['vite', 'build', '--logLevel', 'warn'], dir)
  return { ok: code === 0, log }
}

/**
 * The generated project's dependencies.
 *
 * A symlink to the template's install is enough and is instant, which matters
 * when the loop rebuilds five times. `npm install` is the fallback for a project
 * built somewhere the template is not — the tool is offline-first, not
 * offline-only, and a missing install is worse than a slow one.
 */
async function ensureModules(dir: string): Promise<void> {
  const target = join(dir, 'node_modules')
  if (existsSync(target)) return
  const shared = join(TEMPLATE, 'node_modules')
  if (existsSync(shared)) {
    await symlink(shared, target, 'dir').catch(() => {})
    if (existsSync(target)) return
  }
  await run('npm', ['install', '--no-audit', '--no-fund'], dir).catch(() => {})
}

function run(cmd: string, args: string[], cwd: string): Promise<{ code: number; log: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, CI: '1' } })
    let log = ''
    child.stdout.on('data', (d) => (log += d))
    child.stderr.on('data', (d) => (log += d))
    child.on('error', (err) => resolve({ code: 1, log: String(err) }))
    child.on('close', (code) => resolve({ code: code ?? 1, log }))
  })
}

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
}

/**
 * Serve `dist/` over HTTP.
 *
 * Not `file://`: the built bundle references `/assets/*.js` at the origin root,
 * which a file URL resolves to the filesystem root and silently renders an empty
 * page. A plain static server is a dozen lines and removes a whole class of
 * "the diff is 0 and the code is fine" confusion.
 */
function serveDist(
  dir: string,
): Promise<{ server: Server; url: string }> {
  return new Promise((resolve, reject) => {
    const root = join(dir, 'dist')
    const server = createServer((req, res) => {
      const rel = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '')
      const file = join(root, rel === '/' || rel === '\\' ? 'index.html' : rel)
      if (!file.startsWith(root) || !existsSync(file)) {
        res.writeHead(404).end('not found')
        return
      }
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
      createReadStream(file).pipe(res)
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') reject(new Error('no port'))
      else resolve({ server, url: `http://127.0.0.1:${address.port}` })
    })
  })
}

export interface CaptureResult {
  png: Buffer
  /** Node id → the box the *rendered* page put it in. */
  boxes: Map<string, { x: number; y: number; w: number; h: number }>
  /** Families the page asked for and the browser could not resolve. */
  missingFonts: string[]
}

/**
 * Load the built page and read back where every emitted node landed.
 *
 * The `[data-stitch-id]` attributes the emitter writes are the whole reason this
 * works: they turn the render into something comparable to the IR rather than
 * two pictures, which is what makes a region score locatable in the source.
 */
export async function capture(dir: string, ir: IR, families: string[]): Promise<CaptureResult> {
  const { server, url } = await serveDist(dir)
  const browser: Browser = await chromium.launch()
  try {
    const page = await browser.newPage({
      viewport: { width: ir.viewport.width, height: ir.viewport.height },
      deviceScaleFactor: 1,
    })
    await page.goto(url, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    // The bundle mounts after `load`, so the first frame can be the empty root
    // div. Waiting for a `[data-stitch-id]` is the page's own readiness signal.
    await page.waitForSelector('[data-stitch-id]', { timeout: 10_000 }).catch(() => {})

    const boxes = new Map<string, { x: number; y: number; w: number; h: number }>()
    const found = await page.evaluate(() => {
      const out: { id: string; x: number; y: number; w: number; h: number }[] = []
      for (const el of Array.from(document.querySelectorAll('[data-stitch-id]'))) {
        const r = el.getBoundingClientRect()
        out.push({ id: el.getAttribute('data-stitch-id') ?? '', x: r.x, y: r.y, w: r.width, h: r.height })
      }
      return out
    })
    for (const b of found) if (b.id && !boxes.has(b.id)) boxes.set(b.id, { x: b.x, y: b.y, w: b.w, h: b.h })

    const missingFonts = await page.evaluate((names) => {
      const gone: string[] = []
      for (const n of names) if (!document.fonts.check(`16px "${n}"`)) gone.push(n)
      return gone
    }, families)

    const png = await page.screenshot()
    return { png: Buffer.from(png), boxes, missingFonts }
  } finally {
    await browser.close()
    server.close()
  }
}
