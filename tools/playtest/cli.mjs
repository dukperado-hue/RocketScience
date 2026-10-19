#!/usr/bin/env node
/**
 * RocketScience playtest harness — drive the built game in headless Chromium from the shell.
 *
 *   node tools/playtest/cli.mjs start <persona> [--viewport desktop|mobile] [--rebuild] [--fresh]
 *   node tools/playtest/cli.mjs <command> ...        (talks to the running session)
 *   node tools/playtest/cli.mjs stop
 *
 * `start` builds the game (once) into dist-playtest/, serves it with Vite's preview server and opens
 * a page in Chromium. The session lives in a detached background process, so every later command is a
 * separate short CLI call — which is what an agent playtester needs. Screenshots go to
 * playtest/runs/<persona>/ . Run `node tools/playtest/cli.mjs help` for the command list.
 */
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUNS = path.join(ROOT, 'playtest', 'runs');
const SESSION = path.join(RUNS, '.session.json');
const DIST = 'dist-playtest';

const VIEWPORTS = {
  desktop: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false },
  mobile: {
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
};

const HELP = `RocketScience playtest harness
  start <persona> [--viewport desktop|mobile] [--rebuild] [--fresh]   open the game (desktop 1366x768, mobile 390x844 touch)
  stop                                    close the browser and the preview server
  screenshot [label]                      save a PNG to playtest/runs/<persona>/ and print its path
  click <x> <y>                           mouse click (touch tap on mobile) at viewport pixels
  drag <x1> <y1> <x2> <y2>                press, move, release (Factory part placement)
  tap <selector>                          click a DOM element (CSS selector, or text=Some label)
  key <k>                                 press a key: Space, r, Escape, ArrowLeft, Shift+z ...
  hold <k> <seconds>                      hold a key down for N seconds
  type <text>                             type text into the focused field
  wait <seconds>                          real-time wait
  log                                     flight log lines, CAPCOM line, toast and summary card text
  events                                  window.__rsEvents (analytics buffer)
  state                                   phase, mission, T+, state, altitude, velocity, apogee, retry attempt, storage mode
  console                                 browser console messages and page errors since start
  eval <js expression>                    evaluate JavaScript in the page and print the JSON result
Every command prints plain text/JSON. Exit code 1 on error.`;

/* ------------------------------------------------------------------ client */

const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === '__daemon') await daemon(JSON.parse(args[1]));
else if (!cmd || cmd === 'help' || cmd === '--help') console.log(HELP);
else if (cmd === 'start') await start(args.slice(1));
else await send(cmd, args.slice(1));

async function start(a) {
  const persona = a.find((x) => !x.startsWith('--') && a[a.indexOf(x) - 1] !== '--viewport');
  if (!persona) fail('usage: start <persona> [--viewport desktop|mobile] [--rebuild] [--fresh]');
  const vi = a.indexOf('--viewport');
  const viewport = vi >= 0 ? a[vi + 1] : 'desktop';
  if (!VIEWPORTS[viewport]) fail(`unknown viewport "${viewport}" (desktop | mobile)`);
  if (fs.existsSync(SESSION)) {
    const old = readSession();
    if (old && (await ping(old.port))) fail(`a session is already running (persona "${old.persona}", port ${old.port}). Run: stop`);
    fs.rmSync(SESSION, { force: true });
  }
  fs.mkdirSync(path.join(RUNS, persona), { recursive: true });
  const indexHtml = path.join(ROOT, DIST, 'index.html');
  if (a.includes('--rebuild') || !fs.existsSync(indexHtml)) {
    console.log('building the game for playtest (base "/") ...');
    execFileSync(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', DIST, '--emptyOutDir'], {
      cwd: ROOT, stdio: 'inherit', env: { ...process.env, VITE_BASE: '/' },
    });
  }
  const opts = JSON.stringify({ persona, viewport, fresh: a.includes('--fresh') });
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '__daemon', opts], {
    cwd: ROOT, detached: true, stdio: ['ignore', fs.openSync(path.join(RUNS, persona, 'daemon.log'), 'w'), fs.openSync(path.join(RUNS, persona, 'daemon.log'), 'a')],
    windowsHide: true,
  });
  child.unref();
  for (let i = 0; i < 100; i++) {
    await sleep(300);
    const s = readSession();
    if (s && (await ping(s.port))) { console.log(`ready: persona=${persona} viewport=${viewport} ${VIEWPORTS[viewport].viewport.width}x${VIEWPORTS[viewport].viewport.height} url=${s.url}\nscreenshots -> ${path.join('playtest', 'runs', persona)}`); return; }
  }
  fail(`the session did not start; see playtest/runs/${persona}/daemon.log`);
}

async function send(command, rest) {
  const s = readSession();
  if (!s || !(await ping(s.port))) fail('no running session. Start one: node tools/playtest/cli.mjs start <persona> [--viewport desktop|mobile]');
  const res = await post(s.port, { command, args: rest });
  if (res.error) fail(res.error);
  if (command === 'stop') fs.rmSync(SESSION, { force: true });
  console.log(res.out);
}

function readSession() { try { return JSON.parse(fs.readFileSync(SESSION, 'utf8')); } catch { return null; } }
function fail(msg) { console.error(msg); process.exit(1); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function post(port, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path: '/cmd', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (r) => {
      let t = ''; r.on('data', (c) => (t += c)); r.on('end', () => { try { resolve(JSON.parse(t)); } catch (e) { reject(e); } });
    });
    req.on('error', reject); req.end(data);
  });
}
async function ping(port) { try { return (await post(port, { command: 'ping', args: [] })).out === 'pong'; } catch { return false; } }

/* ------------------------------------------------------------------ daemon */

async function daemon({ persona, viewport, fresh }) {
  const { chromium } = await import('playwright');
  const { preview } = await import('vite');
  process.env.VITE_BASE = '/';
  const dir = path.join(RUNS, persona);
  const server = await preview({ root: ROOT, base: '/', configFile: path.join(ROOT, 'vite.config.ts'), build: { outDir: DIST }, preview: { port: 4173, strictPort: false, host: '127.0.0.1' } });
  const url = server.resolvedUrls.local[0];
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext(VIEWPORTS[viewport]);
  const page = await context.newPage();
  const consoleLog = [];
  page.on('console', (m) => consoleLog.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => consoleLog.push(`[pageerror] ${e.message}`));
  if (fresh) await context.clearCookies();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('#app[data-phase]', { timeout: 20000 });
  let shot = 0;
  const touch = VIEWPORTS[viewport].hasTouch;

  const handlers = {
    ping: async () => 'pong',
    screenshot: async ([label = 'shot']) => {
      const file = path.join(dir, `${String(++shot).padStart(3, '0')}-${label.replace(/[^\w.-]+/g, '_')}.png`);
      await page.screenshot({ path: file });
      return file;
    },
    click: async ([x, y]) => { await (touch ? page.touchscreen.tap(+x, +y) : page.mouse.click(+x, +y)); return `clicked ${x},${y}`; },
    drag: async ([x1, y1, x2, y2]) => {
      await page.mouse.move(+x1, +y1); await page.mouse.down();
      await page.mouse.move((+x1 + +x2) / 2, (+y1 + +y2) / 2, { steps: 6 }); await page.mouse.move(+x2, +y2, { steps: 6 });
      await page.mouse.up(); return `dragged ${x1},${y1} -> ${x2},${y2}`;
    },
    tap: async (a) => { const sel = a.join(' '); const loc = page.locator(sel).first(); await loc.click({ timeout: 5000 }); return `tapped ${sel}`; },
    key: async ([k]) => { await page.keyboard.press(k.replace(/^space$/i, 'Space')); return `pressed ${k}`; },
    hold: async ([k, s]) => { await page.keyboard.down(k); await page.waitForTimeout(+s * 1000); await page.keyboard.up(k); return `held ${k} ${s}s`; },
    type: async (a) => { await page.keyboard.type(a.join(' ')); return 'typed'; },
    wait: async ([s]) => { await page.waitForTimeout(+s * 1000); return `waited ${s}s`; },
    log: async () => page.evaluate(() => {
      const t = (s) => document.querySelector(s)?.textContent?.trim() ?? '';
      const lines = [...document.querySelectorAll('[data-k="log"] > *')].map((e) => e.textContent.trim().replace(/\s+/g, ' '));
      const sum = document.querySelector('.hud-summary');
      return JSON.stringify({
        flightLog: lines,
        capcom: { who: t('.hud-capcom .cc-name'), text: t('.hud-capcom .cc-text'), translation: t('.hud-capcom .cc-trans') },
        toast: t('.toast.on'),
        milestone: t('.rs-milestone'),
        summary: sum && !sum.hidden ? sum.textContent.trim().replace(/\s+/g, ' ') : null,
      }, null, 1);
    }),
    events: async () => JSON.stringify(await page.evaluate(() => window.__rsEvents ?? []), null, 1),
    state: async () => JSON.stringify(await page.evaluate(() => {
      const t = (k) => document.querySelector(`[data-k="${k}"]`)?.textContent?.trim() ?? null;
      const rs = window.__rs;
      const cur = rs?.campaign?.current?.();
      return {
        phase: document.getElementById('app')?.dataset.phase ?? null,
        mode: rs?.campaign?.mode ?? null,
        mission: cur ? `${cur.label} · ${cur.title}` : null,
        completed: Object.keys(rs?.campaign?.snapshot?.().completed ?? {}),
        t: t('t'), flight: t('state'), altitude: t('alt'), velocity: t('vel'), vertical: t('vy'), apogee: t('apo'), throttle: t('thr'),
        retryAttempt: rs?.quickRetry?.attempt ?? null, canRetry: rs?.quickRetry?.canRetry ?? null,
        storageMemoryOnly: rs?.safeKV?.memoryOnly ?? null,
        summaryOpen: !!document.querySelector('.hud-summary:not([hidden])'),
      };
    }), null, 1),
    console: async () => consoleLog.join('\n') || '(no console output)',
    eval: async (a) => JSON.stringify(await page.evaluate(a.join(' ')), null, 1),
    stop: async () => { setTimeout(shutdown, 100); return 'stopping'; },
  };

  async function shutdown() {
    try { fs.writeFileSync(path.join(dir, 'console.log'), consoleLog.join('\n')); } catch { /* best effort */ }
    try { await browser.close(); } catch { /* ignore */ }
    try { await server.close(); } catch { /* ignore */ }
    process.exit(0);
  }

  const control = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      let out;
      try {
        const { command, args: a } = JSON.parse(body);
        const h = handlers[command];
        out = h ? { out: String(await h(a ?? [])) } : { error: `unknown command "${command}". Run: help` };
      } catch (e) { out = { error: String(e.message ?? e) }; }
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(out));
    });
  });
  await new Promise((r) => control.listen(0, '127.0.0.1', r));
  fs.mkdirSync(RUNS, { recursive: true });
  fs.writeFileSync(SESSION, JSON.stringify({ port: control.address().port, pid: process.pid, persona, viewport, url }));
  browser.on('disconnected', () => process.exit(0));
}
