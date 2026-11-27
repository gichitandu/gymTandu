#!/usr/bin/env node
// Genera i video tecnici (MP4 1280x720 20 fps, 28 s, senza audio), il poster JPG e i sottotitoli VTT.
// Uso: node tools/technique-videos/render.mjs <id>... | --all  [--frames N] [--out DIR]
// Richiede Chromium con Playwright e ffmpeg. Non modifica il catalogo né i dati utente.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { SPECS } from './specs.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const args = process.argv.slice(2);
const outDir = resolve(root, args.includes('--out') ? args[args.indexOf('--out') + 1] : 'public/training/videos/gt-technique-v1');
const framesLimit = args.includes('--frames') ? Number(args[args.indexOf('--frames') + 1]) : 0;
const flagValues = new Set(['--frames', '--out']);
const wanted = args.filter((a, i) => !a.startsWith('--') && !flagValues.has(args[i - 1]));
const specs = args.includes('--all') ? SPECS : SPECS.filter(s => wanted.includes(s.id));
if (!specs.length) { console.error('Nessun esercizio selezionato. Disponibili:\n' + SPECS.map(s => ' ' + s.id).join('\n')); process.exit(1); }

const FPS = 20, DURATION = 28, PERIOD = 4;
const PHASES = [[0, 5, '01 / PREPARAZIONE', 'prep'], [5, 17, '02 / ESECUZIONE', 'exec'], [17, 24, '03 / ERRORI DA EVITARE', 'err'], [24, 28, '04 / RESPIRAZIONE', 'breath']];
const MIME = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript' };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x').pathname;
  let file = url === '/' ? join(here, 'page.html') : url.startsWith('/tools/') ? join(here, url.slice(7)) : join(root, 'public', url);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try { const body = await readFile(file); res.writeHead(200, { 'content-type': MIME[file.slice(file.lastIndexOf('.'))] ?? 'application/octet-stream' }).end(body); }
  catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// Playwright può essere globale (NODE_PATH), che gli import ESM ignorano: si usa require.
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ease = x => x * x * (3 - 2 * x);

function uiFor(spec, t) {
  const phase = PHASES.find(p => t < p[1]) ?? PHASES[3];
  const [, , step, key] = phase;
  const content = spec[key];
  const ui = { step, head: content[0], progress: t / DURATION };
  if (Array.isArray(content[1])) ui.bullets = content[1]; else ui.text = content[1];
  let s = 0, label = 'POSIZIONE INIZIALE';
  if (t >= 5) { const c = ((t - 5) / PERIOD) % 1; s = (1 - Math.cos(c * Math.PI * 2)) / 2; label = c < .5 ? spec.labels[0] : spec.labels[1]; }
  ui.phase = label;
  const [v0, v1] = spec.views, k = ease(Math.min(1, Math.max(0, (t - 17) / 1.2)));
  const yaw = v0.yaw + (v1.yaw - v0.yaw) * k;
  ui.view = k < .5 ? v0.label : v1.label;
  return { s, yaw, ui };
}

function vtt(spec) {
  const f = x => `00:00:${String(x).padStart(2, '0')}.000`;
  const cues = PHASES.map(([a, b], i) => `${i + 1}\n${f(a)} --> ${f(b)}\n${spec.vtt[i].join('\n')}\n`);
  return 'WEBVTT\n\n' + cues.join('\n');
}

for (const spec of specs) {
  const started = Date.now();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => { console.error('Errore pagina:', e.message); });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.ready === true);
  await page.evaluate(s => window.setup(s), spec);
  await mkdir(join(outDir, 'posters'), { recursive: true });
  await mkdir(join(outDir, 'subtitles'), { recursive: true });
  if (args.includes('--poses')) { // anteprima: pose estreme in entrambe le viste, senza video
    for (const [vi, v] of spec.views.entries()) for (const s of [0, 1]) {
      const { ui } = uiFor(spec, 8);
      await page.evaluate(([a, b, c]) => window.frame(a, b, c), [s, v.yaw, { ...ui, view: v.label }]);
      await writeFile(join(outDir, `pose-${spec.id}-v${vi}-s${s}.jpg`), await page.screenshot({ type: 'jpeg', quality: 90 }));
    }
    await page.close(); continue;
  }
  const mp4 = join(outDir, `${spec.id}.mp4`);
  const total = framesLimit || FPS * DURATION;
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '26', '-movflags', '+faststart', '-an', mp4], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok, ko) => { ff.on('exit', c => c === 0 ? ok() : ko(new Error('ffmpeg ' + c))); ff.on('error', ko); });
  for (let n = 0; n < total; n++) {
    const t = n / FPS, { s, yaw, ui } = uiFor(spec, t);
    await page.evaluate(([a, b, c]) => window.frame(a, b, c), [s, yaw, ui]);
    const jpg = await page.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(jpg)) await new Promise(r => ff.stdin.once('drain', r));
    if (n === Math.min(total - 1, FPS * 8)) await writeFile(join(outDir, 'posters', `${spec.id}.jpg`), jpg);
  }
  ff.stdin.end(); await done;
  await writeFile(join(outDir, 'subtitles', `${spec.id}.vtt`), vtt(spec));
  await page.close();
  console.log(`${spec.id}: ${total} fotogrammi in ${Math.round((Date.now() - started) / 1000)} s`);
}
await browser.close(); server.close();
