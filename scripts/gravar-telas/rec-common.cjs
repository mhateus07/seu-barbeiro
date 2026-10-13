// Gravador (adaptado de SaaS_Pedeli/scripts/gravar-telas/rec.js): screenshots 2x
// em sequência com a página desacelerada; o ffmpeg devolve o tempo normal.
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { chromium } = require('playwright')
const SLOW = 2.5
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const wait = (ms) => sleep(ms * SLOW)
const WEB = 'http://localhost:5199'
const API = 'http://localhost:3334/api/v1'

async function startRec(page, dir) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Animation.enable')
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / SLOW })
  const frames = []
  let running = true
  const loop = (async () => {
    while (running) {
      const t = Date.now()
      const buf = await page.screenshot({ type: 'jpeg', quality: 92 })
      const name = `f${String(frames.length).padStart(5, '0')}.jpg`
      fs.writeFileSync(path.join(dir, name), buf)
      frames.push({ name, t: t / 1000 })
    }
  })()
  return {
    async stop() {
      running = false
      await loop
      const tEnd = Date.now() / 1000
      await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 })
      const lines = []
      frames.forEach((fr, i) => {
        const next = i + 1 < frames.length ? frames[i + 1].t : tEnd
        lines.push(`file '${fr.name}'`, `duration ${(Math.max(0.001, next - fr.t) / SLOW).toFixed(4)}`)
      })
      lines.push(`file '${frames[frames.length - 1].name}'`)
      fs.writeFileSync(path.join(dir, 'list.txt'), lines.join('\n'))
      return { frames: frames.length }
    },
  }
}

function encode(dir, out, { width, crf = 22 }) {
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'),
    '-vf', `fps=30,scale=${width}:-2:flags=lanczos,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-profile:v', 'high', '-movflags', '+faststart', '-an', out + '.mp4'])
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', out + '.mp4', '-frames:v', '1', '-q:v', '3', out + '.jpg'])
}

const CURSOR_JS = `
(() => {
  if (window.__cursor) return;
  const touch = !!window.__touchMode;
  const c = document.createElement('div');
  c.innerHTML = touch ? '<div style="width:38px;height:38px;margin:-19px 0 0 -19px;border-radius:50%;background:rgba(21,35,63,.22);border:2px solid rgba(255,255,255,.9);box-shadow:0 2px 8px rgba(0,0,0,.2)"></div>' : '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M5 2.5 19 13l-6.4 1.1 3.9 6.9-2.6 1.4-3.9-7L5 20Z" fill="#15233f" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-200px,-200px)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.25))' });
  const ring = document.createElement('div');
  Object.assign(ring.style, { position: 'fixed', width: '34px', height: '34px', margin: '-17px 0 0 -17px', borderRadius: '50%', background: 'rgba(169,195,230,.45)', zIndex: 2147483646, pointerEvents: 'none', opacity: '0', transition: 'opacity .35s, transform .35s', transform: 'scale(.4)' });
  const add = () => { document.body.appendChild(ring); document.body.appendChild(c); };
  if (document.body) add(); else addEventListener('DOMContentLoaded', add);
  addEventListener('mousemove', (e) => { c.style.transform = touch ? 'translate(' + e.clientX + 'px,' + e.clientY + 'px)' : 'translate(' + (e.clientX - 5) + 'px,' + (e.clientY - 3) + 'px)'; }, true);
  addEventListener('mousedown', (e) => { ring.style.left = e.clientX + 'px'; ring.style.top = e.clientY + 'px'; ring.style.transition = 'none'; ring.style.opacity = '1'; ring.style.transform = 'scale(.4)'; requestAnimationFrame(() => { ring.style.transition = 'opacity .45s, transform .45s'; ring.style.opacity = '0'; ring.style.transform = 'scale(1.4)'; }); }, true);
  window.__cursor = true;
})();`

let mouse = { x: 800, y: 450 }
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
async function moveTo(page, x, y, ms = 650) {
  const from = { ...mouse }
  const n = Math.max(1, Math.round(ms / 16))
  for (let i = 1; i <= n; i++) {
    const k = ease(i / n)
    await page.mouse.move(from.x + (x - from.x) * k, from.y + (y - from.y) * k)
    await wait(ms / n)
  }
  mouse = { x, y }
}
async function clickSmooth(page, locator, { ms = 650, pause = 220 } = {}) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  await moveTo(page, box.x + box.width / 2, box.y + box.height / 2, ms)
  await wait(pause)
  await page.mouse.down(); await wait(90); await page.mouse.up()
}
async function typeSlow(page, text, ms = 70) {
  for (const ch of text) { await page.keyboard.type(ch); await wait(ms) }
}
async function token() {
  const r = await fetch(API + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-salon': 'demo' }, body: JSON.stringify({ email: 'demo@salon.local', password: 'Demo-salon-2026' }) })
  return (await r.json()).data
}
function tomorrowAt(h, m) {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(h, m, 0, 0); return d
}
module.exports = { chromium, startRec, encode, CURSOR_JS, moveTo, clickSmooth, typeSlow, token, tomorrowAt, wait, sleep, WEB, API, SLOW }
