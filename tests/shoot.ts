/**
 * Dev helper: render a fixture HTML to a PNG. Real runs get the screenshot from
 * Stitch; fixtures need one generated so `stitch eval` has a reference.
 *
 *   npx tsx tests/shoot.ts fixtures/pricing.html 1040 640
 */
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const [, , htmlArg, wArg = '1040', hArg = '640'] = process.argv
const html = resolve(htmlArg)
const out = html.replace(/\.html$/, '.png')

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: Number(wArg), height: Number(hArg) },
  deviceScaleFactor: 1,
})
await page.goto(`file://${html}`, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: out })
await browser.close()
console.log(out)
