import { chromium } from 'node_modules/playwright/index.mjs'
import path from 'node:path'
const dir = path.dirname(new URL(import.meta.url).pathname)
const b = await chromium.launch()
const names = { 1: 'signin-1-password', 2: 'signin-2-code', 3: 'settings-3-people', 4: 'settings-4-remove' }
for (const s of [1, 2, 3, 4]) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
  await p.goto('file://' + path.join(dir, 'mock.html') + '?s=' + s)
  await p.waitForTimeout(900)
  await p.screenshot({ path: path.join(dir, names[s] + '.png') })
  await p.close()
}
await b.close()
console.log('ok')
