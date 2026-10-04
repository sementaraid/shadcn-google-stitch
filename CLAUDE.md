# stitch-to-react

CLI: HTML Stitch + screenshot → project Vite + React + TS + Tailwind v4 + shadcn.

```bash
stitch code.html shot.png -o ./out
```

---

## Prinsip

1. **Deterministik dulu, LLM terakhir.** Browser yang jawab "apa ini" (role, box, style). LLM cuma buat node ambigu + naming prop. LLM mati → tools tetap jalan (`--offline`), skor lebih rendah.
2. **Registry di-vendor, bukan di-fetch.** shadcn + lucide disimpan lokal saat `sync`. Runtime offline, deterministik, bisa di-test.
3. **Emit lewat AST, bukan string concat.** `ts-morph`. Output stabil + bisa di-patch per-node di loop verify.

---

## Pipeline

```
code.html + screenshot.png
  │
  ├─ 1. INGEST    render Playwright, freeze animasi, viewport = dimensi PNG
  ├─ 2. EXTRACT   walk DOM → IR (geometry + style + tree + repeat + kind)
  ├─ 3. CLASSIFY  scorer signature library → kandidat + skor per node
  ├─ 4. LLM PASS  hanya node ambigu (0.5–0.8) + grouping region + infer props
  ├─ 5. CODEGEN   IR + keputusan → AST → project Vite React TS
  ├─ 6. VERIFY    build → screenshot → pixel-diff (masked) → heatmap region
  │                 └─ region jelek → patch AST ke LLM → ulang (max K)
  └─ 7. REPORT    skor, node low-confidence, patch log, artifact dir
```

---

## 2. EXTRACT — IR

Kontrak seluruh tools.

```ts
type Kind = 'container' | 'text' | 'image' | 'icon' | 'illustration' | 'control'

type NodeIR = {
  id: string              // stabil "n0001", dipakai lintas tahap
  path: string            // CSS path asli, buat locator Playwright
  tag: string
  role: string | null
  ariaLabel: string | null
  text: string | null     // direct text node saja
  box: { x: number; y: number; w: number; h: number }
  style: StyleSubset      // ~40 prop relevan
  children: string[]      // ref ke NodeIR lain
  depth: number
  visible: boolean        // occlusion check elementFromPoint
  kind: Kind
  repeat: { count: number; siblingIds: string[] } | null   // ≥2 struktur identik → kandidat .map()
  isLeafOpaque: boolean   // svg/canvas/img → jangan dipecah
  cropPath: string | null // crop PNG, buat LLM vision
}

type StyleSubset = {
  display, position, flexDirection, alignItems, justifyContent, gap,
  width, height, padding, margin, borderRadius, borderWidth, borderColor,
  background, color, fontSize, fontWeight, lineHeight, letterSpacing,
  boxShadow, opacity, overflow, cursor, zIndex, gridTemplateColumns
}
```

Wajib di tahap ini:

- **Freeze.** Sebelum screenshot: `* { transition: none !important; animation-play-state: paused !important }`, tunggu `document.fonts.ready`, semua `<img>` `complete`. Tanpa ini diff tidak pernah stabil.
- **Viewport dari PNG.** `viewport = { width: png.width, height: png.height }`, `deviceScaleFactor: 1`. Jangan asumsi 1280×720.
- **Repeat detection.** Sub-tree hash (tag + style + struktur, text dinormalize ke placeholder). Kemunculan ≥2 → kandidat `.map()`. Ini yang bikin output React beneran, bukan JSX panjang.
- **Opaque leaf.** `svg`/`canvas`/`img` → jangan pernah dipecah jadi komponen. Emit mentah.

---

## 3. CLASSIFY — signature library

Tiap komponen shadcn punya **signature**: matcher deklaratif atas IR.

```ts
export const button: Signature = {
  name: 'Button',
  weight: {
    tag:       (n) => ['button','a'].includes(n.tag) ? 1 : 0,
    role:      (n) => n.role === 'button' ? 1 : 0,
    cursor:    (n) => n.style.cursor === 'pointer' ? 0.4 : 0,
    textOnly:  (n) => n.children.length <= 1 && n.text ? 0.3 : 0,
    padding:   (n) => within(n.style.padding, [8,10,12,16],[16,20,24]) ? 0.3 : 0,
    surface:   (n) => n.style.background !== 'rgba(0, 0, 0, 0)' ? 0.3 : 0,
  },
  variants: {
    variant: (n) => n.style.background === 'transparent'
      ? (n.style.borderWidth !== '0px' ? 'outline' : 'ghost')
      : (isDark(n.style.background) ? 'default' : 'secondary'),
    size: (n) => h(n) >= 44 ? 'lg' : h(n) <= 32 ? 'sm' : 'default',
  },
  iconOnly: (n) => !n.text && n.children.length === 1,
  conflicts: ['Badge','Toggle','Link'],
}
```

Tiap node diskor vs semua signature → `{ name, score, variantHints, evidence[] }`.

| Skor | Aksi |
|---|---|
| ≥ 0.8 | auto-accept |
| 0.5 – 0.8 | **queue LLM** |
| < 0.5 | emit primitive (`div`/`span`) + sisa className |

**Composite bottom-up.** Deteksi wadah dari **anak-anaknya**, bukan dirinya sendiri:

- `Card` = 1 container ber-border/radius/shadow, anak 1–3 region fungsional
- `Dialog` = `position:fixed` overlay + backdrop semi-transparan + panel terpusat
- `Tabs` = `[role=tablist]` atau ≥2 sibling cursor-pointer + sibling panel bergantian
- `Table` = `[role=table]` / `thead`+`tbody` / grid
- `Select` / `Input` / `Combobox` = bedakan dari `[role=listbox]`, `aria-haspopup`, tag `select`
- `DropdownMenu` / `Popover` = `[role=menu]` atau panel absolute ber-zIndex

**Tinggi di tree menang.** Node jadi `Dialog` → anaknya jangan dijadiin `Card` hanya karena kebetulan ber-border.

Tiap signature **wajib punya negative fixture** — HTML + PNG yang harusnya TIDAK match. Tanpa ini akurasi drift tanpa kelihatan.

---

## 4. REGISTRY shadcn (di-vendor)

Dua registry, dua script, dua-duanya di-generate dari sumber nyata — bukan dari daftar yang diketik tangan.

**Komponen** — `npm run sync-registry` (ts-morph). Sumbernya hasil `shadcn` CLI sungguhan di `templates/vite-react-ts/` (style `radix-nova`, 60 komponen, tema oklch asli). Script menyalin `components/ui/*.tsx` apa adanya ke `src/registry/shadcn/components/` lalu mengekstrak permukaan prop-nya:

```ts
{ name: 'Button',
  file: 'button.tsx',
  importPath: '@/components/ui/button',
  slots: ['button'],
  variants: [ { prop: 'variant', options: ['default','outline','secondary','ghost','destructive','link'], default: 'default' },
              { prop: 'size', options: ['default','xs','sm','lg','icon','icon-xs','icon-sm','icon-lg'], default: 'default' } ],
  props: ['asChild','className','props','size','variant'],   // dari destructuring
  stateful: false,                                            // menata data-checked?
  deps: ['class-variance-authority','cn','radix-ui','react'],
  exports: ['Button','buttonVariants'] }
```

Tiga cara sebuah prop bisa muncul, ketiganya dibaca:
1. **cva axis** — `cva(base, { variants })`; default dari `defaultVariants`.
2. **literal union** — `{ size?: "default" | "sm" }`; default dari `size = "default"` di destructuring. `Card` masuk lewat jalur ini dan **tidak punya `variant`** — persis jenis kesalahan yang bikin output tidak compile.
3. **opaque prop** — ada di destructuring tapi domainnya tak bisa dienumerasi (Radix `orientation`, `value` numerik). Diteruskan apa adanya; menebak enum-nya justru tidak jujur.

`reconcile()` di `src/classify/variants.ts` adalah **satu-satunya** tempat yang boleh memutuskan sebuah prop bisa ditulis. Signature mengusulkan dari apa yang dilihat di halaman; registry yang memutuskan. Prop yang sama dengan default komponen dibuang (React sudah menerapkannya).

**Ikon** — `npm run sync-lucide`. Registry dibangun dari **`lucide-react`**, paket yang benar-benar di-import proyek hasil, dengan `renderToStaticMarkup` lalu parsing SVG-nya. Membangunnya dari paket Lucide lain pernah menghasilkan 281 nama yang versi ini tidak ekspor — import yang gagal compile.

Tidak pakai embeddings. Signature matcher cukup; embeddings nambah dep + noise.


---

## 5. LLM PASS — cakupan ketat

Hanya dipanggil untuk:

**(a) Disambiguasi node** — batch, bukan per-node. Satu call 20–50 node ambigu. Input per node: subtree IR yang di-floor-kan + `evidence[]` + top-3 kandidat + prop schema kandidat + crop PNG (~256px). Output JSON schema wajib valid:

```json
{ "id": "n0042", "component": "Button",
  "props": { "variant": "outline", "size": "sm" },
  "confidence": 0.86,
  "fallbackClassName": "rounded-full px-3" }
```

**(b) Grouping composite** yang skornya mepet.
**(c) Patch iterasi verify** — crop region jelek + AST node + diff mask.

Yang **tidak** dikerjakan LLM: nulis JSX dari nol, menerjemahkan Tailwind, milih warna. Semua deterministik.

---

## 6. CODEGEN

### Theme extraction (kunci skor visual)

```ts
// src/codegen/theme.ts
IR.style.{background,color,borderColor}  semua node
  → konversi oklch (culori)
  → cluster, jarak euclidean oklch, threshold ΔE 0.08
  → mapping deterministik:
       bg area terbesar          → --background
       surface ber-border/shadow → --card / --popover
       bg elemen cursor:pointer  → --primary
       teks mayoritas            → --foreground
       teks redup                → --muted-foreground
       border mayoritas          → --border
  → tulis :root { --x: oklch(...) } + @theme inline
```

**Dark mode:** hitung luminance rata-rata screenshot. < 0.5 → tulis ke `.dark` + `class="dark"` di `<html>`. Output satu tema saja, sesuai input — jangan generate dua-duanya.

### Struktur output

```
out/
  package.json  vite.config.ts  tsconfig.json  components.json
  index.html                     ← <link> Google Fonts + <title> sumber
  src/
    main.tsx
    index.css                    ← @import "tailwindcss" + :root oklch + @theme inline
    App.tsx
    components/
      ui/                        ← shadcn v4, apa adanya
      generated/
        SiteHeader.tsx
        HeroSection.tsx
        PricingCard.tsx          ← hasil repeat detection → props
        image-placeholder.tsx
        icons/Custom<Id>.tsx     ← svg non-lucide
      lib/utils.ts               ← cn()
```

Tidak ada `postcss.config.js` — pakai `@tailwindcss/vite`.

```ts
// vite.config.ts
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({ plugins: [react(), tailwindcss()], resolve: { alias: { '@': '/src' } } })
```

```json
// components.json — "config": "" wajib, kalau tidak CLI shadcn nulis config v3 lama
{ "style": "new-york", "tailwind": { "config": "", "css": "src/index.css", "cssVariables": true } }
```

Aturan emit:

- Repeat → komponen dengan props + array data, **bukan** N blok JSX duplikat.
- `<svg>` inline dibiarkan utuh (atau diangkat ke `components/icons/` kalau dipakai >3×).
- Style sisa → Tailwind arbitrary value `w-[137px]`, bukan inline style. Inline cuma untuk nilai yang benar-benar dinamis.
- `data-stitch-id={node.id}` + `data-kind` di tiap elemen, dibungkus `import.meta.env.DEV`. Ini yang bikin verify bisa map DOM render balik ke node IR.

### Font pipeline

Parse dari `code.html`, tiga bentuk:

```
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap">
<link href="https://fonts.googleapis.com/css?family=Roboto:400,700">      ← legacy
<style>@import url('https://fonts.googleapis.com/css?family=Lato');</style>
```

Emit satu link gabungan, family di-dedupe, weight disaring ke yang muncul di `IR.style.fontWeight`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&family=Plus+Jakarta+Sans:wght@500;700&display=swap">
```

Font lewat `<link>`, **bukan** `@import` di CSS — `@import` harus di paling atas dan bertabrakan urutannya dengan `@import "tailwindcss"`. Lebih cepat juga.

Assignment token, deterministik:

- family paling banyak dipakai body/teks → `--font-sans`
- family di elemen `fontSize ≥ 24px` && `fontWeight ≥ 600` → `--font-heading`
- generic asli (`sans-serif`/`serif`/`monospace`) → ekor chain

Cek `document.fonts.check('16px "Inter"')` saat extract. Gagal → warning di report, region teks di-**downweight** saat diff (bukan mask penuh, nilai strukturnya masih berguna).

`--offline-fonts` → download woff2 ke `public/fonts/`, generate `@font-face` lokal.

### Image pipeline

Semua `img`, `<picture>`, `background-image` → satu komponen:

```tsx
export function ImagePlaceholder({ className, src }: { className?: string; src?: string }) {
  return (
    <div data-placeholder data-src={src}
      className={cn('grid place-items-center bg-muted text-muted-foreground', className)}>
      <ImageIcon className="size-6 opacity-40" />
    </div>
  )
}
```

Dimensi asli dipertahankan (`w-[320px] h-[200px]`, atau `aspect-[16/9]` kalau fluid). `src` asli disimpan di `data-src`.

**Region `data-placeholder` selalu di-mask di pixel-diff.** Kalau tidak, loop verify buang iterasi ngejar gambar yang memang tidak akan match. Skor region itu dari rasio dimensi + warna dominan saja.

### Icon pipeline — lucide-react

```ts
type IconMatch =
  | { via: 'class';     name: string; confidence: 1.00 }
  | { via: 'pathHash';  name: string; confidence: 0.98 }
  | { via: 'fuzzy';     name: string; confidence: 0.70; candidates: string[] }
  | { via: 'llm';       name: string; confidence: number }
  | { via: 'none';      candidates: string[] }        // → inline svg
```

**Gate dulu.** Kandidat lucide hanya kalau `viewBox === "0 0 24 24"` && `fill="none"` && `stroke="currentColor"`. Kalau tidak → `illustration`, skip total. Cegah brand logo & ilustrasi custom dipaksa jadi ikon.

Ladder matching, deterministik dulu:

| # | Sinyal | Akurasi |
|---|---|---|
| 1 | `class="lucide lucide-arrow-right"` — Stitch sering menyimpan ini | exact |
| 2 | Normalize path → hash → lookup `hash → name` | exact |
| 3 | Fuzzy: jumlah subpath + segmen + bbox path + tipe primitif | top-5 |
| 4 | LLM vision, crop 64px + 5 kandidat | fallback |
| 5 | Gagal → `illustration`, inline ke `components/icons/Custom<Id>.tsx` | — |

**Normalisasi hash** (kunci #2): serialize tiap anak svg jadi `tag|attr-sorted`, angka round 2 desimal, whitespace collapse, urutan anak di-sort. Tahan reorder & reformat.

Registry lucide, generate sekali via `npm run sync-lucide`:

```ts
export const LUCIDE_NAMES = ['ArrowRight', 'Search', /* ~1600 */] as const
export const LUCIDE_CANONICAL: Record<string, string> = { /* '<hash>': 'ArrowRight' */ }
export const LUCIDE_ALIASES: Record<string, string> = { AlertTriangle: 'TriangleAlert' }
```

Cara: import `lucide-react` → `renderToStaticMarkup` tiap export → normalize → hash. Sekali jalan ~10 detik, hasil di-cache. Nol dependensi tambahan.

Emit dari geometri:

```tsx
<ArrowRight className="size-5 text-muted-foreground" strokeWidth={2} />
```

- `size` = `Math.round(max(w,h))` → `className="size-N"`. Pilih **satu** saja (`size-*` atau prop `size`), jangan dua-duanya.
- `strokeWidth` dari nilai asli, **omit kalau 2** (default lucide).
- warna → token terdekat dari `--foreground`/`--primary`/`--muted-foreground` → `text-*`.
- Nama lucide sudah di-rename di v1: `AlertTriangle` → `TriangleAlert`, `AlertCircle` → `CircleAlert`. Pakai `LUCIDE_ALIASES`.

Import di-dedupe & di-sort per file.

---

## 7. VERIFY

```
vite build → serve dist → Playwright screenshot (viewport & DPR identik)
  → pixelmatch (mask per-region) + SSIM global
  → heatmap → top-N region terburuk
  → cari elemen hasil via [data-stitch-id]
  → crop asli + crop hasil + AST node → LLM patch
  → apply patch ke AST → ulang
```

| kind | Perlakuan diff |
|---|---|
| `image` | mask penuh; skor dari aspect-ratio + warna dominan |
| `icon` | mask; ganti presence check — ada elemen di posisi itu? |
| `text` (font substituted) | downweight 0.3, bukan mask |
| `container` | dinilai normal |
| region `stitch.config.json → dynamic` | mask (tanggal, jam, iklan) |

- **Per-region, bukan global.** Skor global 0.94 bisa menyembunyikan satu hero yang hancur. Keputusan iterasi dari tabel region.
- **Batas iterasi eksplisit.** Default `maxIterations: 5`, stop kalau ΔSSIM < 0.005 dua kali berturut-turut.
- **Patch = AST edit, bukan regenerate.** Regenerate merusak node yang sudah benar. Patch ter-scope ke satu node ID.

Output: `report.html` — SSIM global, tabel region, node < 0.8 confidence, log patch, thumbnail before/after tiap iterasi.

---

## Layout

```
stitch-to-react/
  src/
    cli.ts
    config.ts
    types.ts
    ingest.ts                 # playwright load + freeze + viewport + screenshot
    extract.ts                # walker DOM → IR + repeat detection + kind
    classify.ts               # scorer + composite  [M2]
    registry/                 # shadcn + lucide, di-vendor  [M2/M3]
    llm/                      # client + schema + prompts  [M6]
    codegen/                  # theme + emit + project  [M3/M4]
    verify/                   # build + shoot + diff + heatmap + patch  [M5]
    report.ts                 # ir.json + viewer.html + report.html
  templates/vite-react-ts/
  fixtures/                   # pasangan html+png, termasuk negative
  tests/
```

Dependency: `playwright`, `commander`, `image-size`, `culori`, `ts-morph`, `pixelmatch`, `pngjs`. Tidak ada yang lain tanpa alasan kuat.

---

## CLI

```bash
stitch code.html shot.png -o ./out --stack vite-react-ts
stitch code.html shot.png --offline          # skip LLM, rule-based saja
stitch code.html shot.png --max-iter 0       # sekali jalan, langsung lapor skor
stitch code.html shot.png --debug-ir         # dump ir.json + crop per node
stitch eval fixtures/                        # regression: skor semua fixture
```

`--debug-ir` penting. Tanpa bisa lihat IR mentah, mustahil debug kenapa `<div>` tidak terdeteksi jadi `Card`.

---

## Milestone

**M1 — IR + viewer. ✅** `ingest.ts`, `extract.ts`, `walker.browser.js`, `report.ts`. `stitch code.html shot.png -o out` menulis `ir.json` + `viewer.html` (overlay kotak per node). Nol LLM. *Kalau IR salah, semua di atasnya salah.*

**M2 — Scorer + 13 signature + lucide ladder. ✅** `npm run eval` → **precision 100%, recall 100%** di `fixtures/`, nol negative violation. 1856 ikon Lucide di-vendor via `npm run sync-lucide`.

**Aturan scoring** (ditemukan lewat eval, jangan dilanggar):
- Skor = `(base + Σ sinyal) / (1 + n)`. `base` hanya untuk signature yang **gate**-nya sudah informatif (tag `<label>`, kotak 1px). Gate lemah → `base` kecil.
- **Bobot hanya berisi sinyal struktural.** ARIA (`role`, `aria-*`) tinggal di `requires`, karena HTML hasil Stitch jarang punya ARIA dan sinyal yang mustahil terpenuhi akan menekan plafon skor.
- `isFilled()` pakai `style.backgroundColor`, **bukan** `style.background` — shorthand komputasi berbentuk `"rgb(...) none repeat scroll..."` dan tak pernah cocok dengan perbandingan warna.
- `px()` mengambil panjang **terbesar** dari shorthand: `parseFloat("10px 16px")` = 10, tapi `parseFloat` di `padding` yang dimulai `0px` = 0.
- **`demoteLayoutContainers`**: node dengan ≥2 anak yang sudah jadi komponen adalah region layout, bukan komponen. Ini yang mencegah `<section>` ber-border jadi Card.
- **`interiorOf`**: keturunan komposit yang diterima (`td` di dalam Table, tab item di dalam Tabs) bukan antrean LLM. Tanpa ini, antrean dibanjiri interior setiap komposit.
- **Jangan berasumsi soal API shadcn.** 60 komponen di-vendor sebagai sumber, prop-nya diekstrak `npm run sync-registry` (ts-morph) ke `src/registry/shadcn/index.generated.ts`. `reconcile()` di `classify/variants.ts` memfilter usulan signature terhadap daftar itu. Contoh nyata: `Card` tidak punya `variant` sama sekali (cuma `size: default|sm`) — `<Card variant="outline">` **tidak akan compile**. `Button.size` punya 8 nilai (`icon-xs`…`icon-lg`), bukan 4.
- **State ≠ variant.** Posisi switch / centang checkbox adalah runtime state, ditulis lewat `defaultChecked`, dan hanya boleh kalau sumber komponen memang menata `data-checked` (`entry.stateful`). Menaruhnya di `variants` adalah kesalahan kategori. Signature **mengukur** posisi knob / ada-tidaknya glyph, tidak mengasumsikan nilai diam.

**M3 — Codegen one-shot v4.** Skeleton `@theme`, font `<link>`, `ImagePlaceholder`, emit lucide. Target: `tsc --noEmit` + `vite build` hijau di 3 fixture. **Ini titik tools kepakai.**

**M4 — Theme extraction oklch.** Angkat skor visual ~0.7 → ~0.9.

**M5 — Verify loop + masked diff + patch AST.**

**M6 — LLM disambiguasi.**

M1–M5 harus jalan `--offline`. LLM terakhir: kalau M1–M4 tidak bisa jalan tanpa LLM, ada yang salah di desain.

---

## Jebakan

- **Tailwind v4, bukan v3.** Token di CSS `@theme`, bukan `tailwind.config.ts`. Jangan pakai pola v3.
- **`components.json`**: `"tailwind.config": ""` wajib, kalau tidak CLI shadcn diam-diam menulis config v3 lama.
- **Font tidak ada di sistem** → diff selalu jelek di area teks. Deteksi & downweight, jangan dikejar.
- **`<img src>` eksternal** → download & jadikan lokal saat ingest, kalau tidak screenshot verify blank.
- **Overflow & scroll** → screenshot full-page vs viewport menentukan koordinat IR.
