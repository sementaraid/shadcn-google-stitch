import { readFile } from 'node:fs/promises'
import { PNG } from 'pngjs'
import { chromium, type Browser, type Page } from 'playwright'

export interface Ingested {
  page: Page
  browser: Browser
  viewport: { width: number; height: number }
  screenshot: string
  title: string
  /** content height of document, in CSS px */
  docHeight: number
  /** fonts the source asks for that the browser could not resolve */
  fontSubstituted: string[]
  close: () => Promise<void>
}

export function pngSize(buf: Buffer): { width: number; height: number } {
  const png = PNG.sync.read(buf)
  return { width: png.width, height: png.height }
}

/**
 * Load the source HTML in Chromium clamped to the screenshot's exact dimensions,
 * freeze everything that moves, and block until fonts + images have settled.
 * Without the freeze, every later pixel-diff is noise.
 */
export async function ingest(
  htmlPath: string,
  screenshotPath: string,
  opts: { deviceScaleFactor: number },
): Promise<Ingested> {
  const shot = await readFile(screenshotPath)
  const { width, height } = pngSize(shot)

  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: opts.deviceScaleFactor,
  })
  const page = await context.newPage()

  const warnings: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') warnings.push(m.text())
  })

  await page.goto(new URL(`file://${htmlPath}`).href, { waitUntil: 'load' })

  // Freeze. `animation-play-state` alone misses transitions already in flight.
  await page.addStyleTag({
    content: `*, *::before, *::after {
      transition: none !important;
      animation: none !important;
      animation-play-state: paused !important;
      caret-color: transparent !important;
    }
    html { scroll-behavior: auto !important; }`,
  })

  await page.evaluate(async () => {
    // Scroll through the document once so lazy images and IntersectionObserver
    // content actually mount, then return to the top.
    const step = window.innerHeight
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => requestAnimationFrame(() => r(null)))
    }
    window.scrollTo(0, 0)
  })

  await page.evaluate(async () => {
    await document.fonts.ready
    const imgs = Array.from(document.images)
    await Promise.all(
      imgs.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((res) => {
              img.addEventListener('load', () => res(), { once: true })
              img.addEventListener('error', () => res(), { once: true })
            }),
      ),
    )
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
  })

  const meta = await page.evaluate(() => {
    const families = new Set<string>()
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const f = getComputedStyle(el).fontFamily
      if (f) families.add(f)
    }
    const substituted: string[] = []
    for (const f of families) {
      const first = f.split(',')[0].trim().replace(/^["']|["']$/g, '')
      if (!first) continue
      if (!document.fonts.check(`16px "${first}"`)) substituted.push(first)
    }
    return {
      title: document.title,
      docHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
      fontSubstituted: substituted,
    }
  })

  if (meta.docHeight > height + 4) {
    warnings.push(
      `document is ${meta.docHeight}px tall but screenshot is ${height}px — IR below the fold is present but unverifiable`,
    )
  }
  for (const w of warnings) console.error(`  warn: ${w}`)

  return {
    page,
    browser,
    viewport: { width, height },
    screenshot: screenshotPath,
    title: meta.title,
    docHeight: meta.docHeight,
    fontSubstituted: meta.fontSubstituted,
    close: async () => {
      await browser.close()
    },
  }
}
