import { chromium } from 'playwright'

export interface ShotOptions {
  url: string
  width: number
  height: number
  out: string
  /** Milliseconds to let fonts and layout settle before capturing. */
  settleMs?: number
}

/**
 * Screenshot a built page at exactly the reference's dimensions.
 *
 * M3 uses this only to see whether the emitter produced the right page at all;
 * the diff loop and region scoring are M5. Same viewport and DPR as ingest, or
 * the comparison would measure the device rather than the code.
 */
export async function shoot(opts: ShotOptions): Promise<void> {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({
      viewport: { width: opts.width, height: opts.height },
      deviceScaleFactor: 1,
    })
    await page.goto(opts.url, { waitUntil: 'load' })
    // The page's fonts come from a Google `<link>`; capturing before they land
    // would make every text region look wrong for a reason that is not the code.
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: opts.out })
  } finally {
    await browser.close()
  }
}
