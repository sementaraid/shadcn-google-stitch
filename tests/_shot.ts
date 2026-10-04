import { shoot } from '../src/verify/shoot.ts'

const [url, w, h, out] = process.argv.slice(2)
await shoot({
  url: url ?? 'http://localhost:5199/',
  width: Number(w ?? 1040),
  height: Number(h ?? 640),
  out: out ?? '/tmp/generated.png',
})
console.log('shot ok')
