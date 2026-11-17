import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const DEFAULT_CHROME_BIN = process.env.CHROME_BIN || '/usr/bin/chromium';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePngPixels(pngBuffer) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (pngBuffer[i] !== sig[i]) {
      throw new Error('Invalid PNG signature');
    }
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < pngBuffer.length) {
    const len = pngBuffer.readUInt32BE(offset);
    const type = pngBuffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + len;
    if (type === 'IHDR') {
      width = pngBuffer.readUInt32BE(dataStart);
      height = pngBuffer.readUInt32BE(dataStart + 4);
      bitDepth = pngBuffer[dataStart + 8];
      colorType = pngBuffer[dataStart + 9];
    } else if (type === 'IDAT') {
      idatChunks.push(pngBuffer.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }

  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
  }

  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const pixels = Buffer.allocUnsafe(height * stride);

  let rawOffset = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rawOffset++];
    const rowStart = y * stride;
    const prevRowStart = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const val = raw[rawOffset++];
      const a = x >= bpp ? pixels[rowStart + x - bpp] : 0;
      const b = y > 0 ? pixels[prevRowStart + x] : 0;
      const c = y > 0 && x >= bpp ? pixels[prevRowStart + x - bpp] : 0;
      let recon;
      if (filter === 0) recon = val;
      else if (filter === 1) recon = (val + a) & 0xff;
      else if (filter === 2) recon = (val + b) & 0xff;
      else if (filter === 3) recon = (val + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) recon = (val + paethPredictor(a, b, c)) & 0xff;
      else throw new Error(`Unsupported PNG scanline filter ${filter}`);
      pixels[rowStart + x] = recon;
    }
  }

  return { width, height, bpp, pixels };
}

export function analyzeAccentPixels(pngBuffer) {
  const { width, height, bpp, pixels } = decodePngPixels(pngBuffer);
  const totalPixels = width * height;
  const maxDistSq = 42 * 42;

  let primaryCount = 0;
  let secondaryCount = 0;
  let combinedAccentCount = 0;
  let neonCyanCount = 0;
  let neonMagentaCount = 0;
  let purpleBlueGlowCount = 0;

  for (let i = 0; i < pixels.length; i += bpp) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    const d1 = (r - 224) ** 2 + (g - 113) ** 2 + (b - 25) ** 2; // #E07119
    const d2 = (r - 194) ** 2 + (g - 145) ** 2 + (b - 54) ** 2; // #C29136
    const isP = d1 <= maxDistSq;
    const isS = d2 <= maxDistSq;
    if (isP) primaryCount++;
    if (isS) secondaryCount++;
    if (isP || isS) combinedAccentCount++;

    if (r < 55 && g > 195 && b > 195) neonCyanCount++;
    if (r > 195 && g < 65 && b > 175) neonMagentaCount++;
    if ((r > 120 && g < 75 && b > 175) || (r < 80 && g > 140 && b > 220)) {
      purpleBlueGlowCount++;
    }
  }

  return {
    width,
    height,
    totalPixels,
    primaryCount,
    secondaryCount,
    combinedAccentCount,
    accentPct: Number(((combinedAccentCount / totalPixels) * 100).toFixed(4)),
    neonCyanPct: Number(((neonCyanCount / totalPixels) * 100).toFixed(4)),
    neonMagentaPct: Number(((neonMagentaCount / totalPixels) * 100).toFixed(4)),
    purpleBluePct: Number(((purpleBlueGlowCount / totalPixels) * 100).toFixed(4)),
  };
}

const activeClients = new Set();
let signalGuardsAttached = false;
let handlingTermination = false;

function syncCleanupAll() {
  for (const client of [...activeClients]) {
    try {
      client.cleanupSync();
    } catch {
      // ignore cleanup error
    }
  }
}

function onExitCleanup() {
  syncCleanupAll();
}

function onTerminationSignal(sig) {
  if (handlingTermination) {
    syncCleanupAll();
    process.exit(sig === 'SIGINT' ? 130 : 143);
  }
  handlingTermination = true;
  const clients = [...activeClients];
  const timer = setTimeout(() => {
    syncCleanupAll();
    detachSignalGuards();
    process.exit(sig === 'SIGINT' ? 130 : 143);
  }, 800);
  timer.unref();

  Promise.all(clients.map((c) => c.close().catch(() => {}))).finally(() => {
    clearTimeout(timer);
    syncCleanupAll();
    detachSignalGuards();
    try {
      process.kill(process.pid, sig);
    } catch {
      process.exit(sig === 'SIGINT' ? 130 : 143);
    }
  });
}

function onSigInt() {
  onTerminationSignal('SIGINT');
}

function onSigTerm() {
  onTerminationSignal('SIGTERM');
}

function attachSignalGuards() {
  if (signalGuardsAttached) return;
  signalGuardsAttached = true;
  process.on('SIGINT', onSigInt);
  process.on('SIGTERM', onSigTerm);
  process.on('exit', onExitCleanup);
}

function detachSignalGuards() {
  if (!signalGuardsAttached) return;
  signalGuardsAttached = false;
  process.off('SIGINT', onSigInt);
  process.off('SIGTERM', onSigTerm);
  process.off('exit', onExitCleanup);
}

export class CdpClient {
  constructor({ headlessBin = DEFAULT_CHROME_BIN, timeoutMs = 15000 } = {}) {
    this.headlessBin = headlessBin;
    this.timeoutMs = timeoutMs;
    this.proc = null;
    this.userDataDir = null;
    this.ws = null;
    this.sessionId = null;
    this.targetId = null;
    this._mainFrameId = null;
    this.nextId = 1;
    this.pending = new Map();
    this.eventListeners = new Map();
    this.networkResponses = [];
    this.requestFailures = [];
    this.unexpected404s = [];
    this.pageErrors = [];
    this._requestsById = new Map();
    this._intentional404Nav = false;
    this.mockRoutes = null;
    this.fetchEnabled = false;
    this._closed = false;
    this._cleanedSync = false;
  }

  async launch() {
    activeClients.add(this);
    attachSignalGuards();
    this.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jbrunet-cdp-'));
    const flags = [
      '--headless=new',
      '--remote-debugging-port=0',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-crash-reporter',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${this.userDataDir}`,
      'about:blank',
    ];

    this.proc = spawn(this.headlessBin, flags, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const wsUrl = await new Promise((resolve, reject) => {
      let stderrBuf = '';
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for DevTools WebSocket URL. stderr:\n${stderrBuf}`));
      }, this.timeoutMs);

      const onData = (chunk) => {
        stderrBuf += chunk.toString('utf8');
        const m = stderrBuf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (m) {
          clearTimeout(timer);
          this.proc.stderr.off('data', onData);
          resolve(m[1]);
        }
      };

      this.proc.stderr.on('data', onData);
      this.proc.once('exit', (code, sig) => {
        clearTimeout(timer);
        reject(new Error(`Chromium exited early (${code}/${sig}). stderr:\n${stderrBuf}`));
      });
      this.proc.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    this.ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket connect timeout')), this.timeoutMs);
      this.ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      });
      this.ws.addEventListener('error', (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error('WebSocket error'));
      });
    });

    this.ws.addEventListener('message', (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data.toString());
      } catch {
        return;
      }
      if (msg.id !== undefined) {
        const entry = this.pending.get(msg.id);
        if (entry) {
          this.pending.delete(msg.id);
          clearTimeout(entry.timer);
          if (msg.error) {
            entry.reject(new Error(`CDP ${entry.method} failed: ${JSON.stringify(msg.error)}`));
          } else {
            entry.resolve(msg.result || {});
          }
        }
        return;
      }

      if (msg.method) {
        this._handleEvent(msg);
      }
    });

    const { targetInfos } = await this.sendBrowser('Target.getTargets');
    let pageTarget = (targetInfos || []).find((t) => t.type === 'page');
    if (!pageTarget) {
      const created = await this.sendBrowser('Target.createTarget', { url: 'about:blank' });
      this.targetId = created.targetId;
    } else {
      this.targetId = pageTarget.targetId;
    }

    const attached = await this.sendBrowser('Target.attachToTarget', {
      targetId: this.targetId,
      flatten: true,
    });
    this.sessionId = attached.sessionId;

    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('DOM.enable');
    await this.send('Network.enable');
    try {
      const ft = await this.send('Page.getFrameTree');
      this._mainFrameId = ft?.frameTree?.frame?.id || null;
    } catch {
      this._mainFrameId = null;
    }

    return this;
  }

  _handleEvent(msg) {
    if (msg.sessionId && msg.sessionId !== this.sessionId) return;

    if (msg.method === 'Network.requestWillBeSent') {
      const p = msg.params || {};
      if (p.requestId && p.request) {
        this._requestsById.set(p.requestId, {
          url: p.request.url || '',
          method: p.request.method || 'GET',
          type: p.type || '',
          frameId: p.frameId || null,
        });
      }
      if (p.redirectResponse) {
        this.networkResponses.push({
          url: p.redirectResponse.url,
          status: p.redirectResponse.status,
          statusText: p.redirectResponse.statusText,
          headers: p.redirectResponse.headers || {},
          mimeType: p.redirectResponse.mimeType || '',
          resourceType: p.type || '',
          frameId: p.frameId || null,
          requestId: p.requestId || null,
          isRedirect: true,
        });
      }
    } else if (msg.method === 'Network.responseReceived') {
      const { response, type, frameId, requestId } = msg.params || {};
      if (response) {
        const entry = {
          url: response.url,
          status: response.status,
          statusText: response.statusText,
          headers: response.headers || {},
          mimeType: response.mimeType || '',
          resourceType: type || '',
          frameId: frameId || null,
          requestId: requestId || null,
          isRedirect: false,
        };
        this.networkResponses.push(entry);
        if (response.status === 404) {
          const isIntentionalDoc404 =
            this._intentional404Nav &&
            type === 'Document' &&
            (!this._mainFrameId || !frameId || frameId === this._mainFrameId);
          if (!isIntentionalDoc404) {
            this.unexpected404s.push({
              url: response.url,
              status: response.status,
              resourceType: type || '',
              frameId: frameId || null,
            });
          }
        }
      }
    } else if (msg.method === 'Network.loadingFailed') {
      const p = msg.params || {};
      const reqInfo = this._requestsById.get(p.requestId);
      if (!p.canceled) {
        this.requestFailures.push({
          requestId: p.requestId,
          url: reqInfo?.url || '',
          method: reqInfo?.method || '',
          type: p.type || reqInfo?.type || '',
          errorText: p.errorText,
        });
      }
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const details = msg.params?.exceptionDetails;
      const text =
        details?.exception?.description || details?.text || JSON.stringify(details);
      this.pageErrors.push(`exception: ${text}`);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      if (msg.params?.type === 'error') {
        const text = (msg.params.args || [])
          .map((a) => a.value ?? a.description ?? a.type)
          .join(' ');
        this.pageErrors.push(`console.error: ${text}`);
      }
    } else if (msg.method === 'Fetch.requestPaused') {
      this._handleFetchPaused(msg.params).catch(() => {});
    }

    const listeners = this.eventListeners.get(msg.method);
    if (listeners) {
      for (const fn of [...listeners]) {
        try {
          fn(msg.params || {});
        } catch {
          // ignore listener error
        }
      }
    }
  }

  async _handleFetchPaused(params) {
    const { requestId, request } = params;
    try {
      if (!this.mockRoutes || !request) {
        await this.send('Fetch.continueRequest', { requestId });
        return;
      }
      const url = request.url || '';
      const method = (request.method || 'GET').toUpperCase();
      for (const route of this.mockRoutes) {
        const routeMethod = route.method ? route.method.toUpperCase() : null;
        if (routeMethod && routeMethod !== method) continue;
        let matched = false;
        if (typeof route.match === 'function') matched = route.match(url, method);
        else if (route.match instanceof RegExp) matched = route.match.test(url);
        else if (typeof route.match === 'string') matched = url.includes(route.match);

        if (matched) {
          const payload = typeof route.body === 'function' ? route.body(url, request) : route.body;
          const rawText = typeof payload === 'string' ? payload : JSON.stringify(payload);
          const mergedHeaders = new Map([
            ['content-type', { name: 'Content-Type', value: 'application/json; charset=utf-8' }],
            ['cache-control', { name: 'Cache-Control', value: 'no-store' }],
          ]);
          for (const [k, v] of Object.entries(route.headers || {})) {
            mergedHeaders.set(k.toLowerCase(), { name: k, value: String(v) });
          }

          await this.send('Fetch.fulfillRequest', {
            requestId,
            responseCode: route.status || 200,
            responseHeaders: [...mergedHeaders.values()],
            body: Buffer.from(rawText, 'utf8').toString('base64'),
          });
          return;
        }
      }
      await this.send('Fetch.continueRequest', { requestId });
    } catch {
      try {
        await this.send('Fetch.continueRequest', { requestId });
      } catch {
        // ignore if closed
      }
    }
  }

  _sendRaw(payload, methodLabel, customTimeout) {
    const id = this.nextId++;
    const timeout = customTimeout ?? this.timeoutMs;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout after ${timeout}ms on ${methodLabel}`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer, method: methodLabel });
      this.ws.send(JSON.stringify({ ...payload, id }));
    });
  }

  sendBrowser(method, params = {}, customTimeout) {
    return this._sendRaw({ method, params }, method, customTimeout);
  }

  send(method, params = {}, customTimeout) {
    return this._sendRaw({ sessionId: this.sessionId, method, params }, method, customTimeout);
  }

  waitForEvent(method, predicate = () => true, timeoutMs = this.timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for CDP event ${method}`));
      }, timeoutMs);
      const handler = (params) => {
        if (predicate(params)) {
          cleanup();
          resolve(params);
        }
      };
      const cleanup = () => {
        clearTimeout(timer);
        const set = this.eventListeners.get(method);
        if (set) set.delete(handler);
      };
      if (!this.eventListeners.has(method)) {
        this.eventListeners.set(method, new Set());
      }
      this.eventListeners.get(method).add(handler);
    });
  }

  clearLogs() {
    this.networkResponses = [];
    this.requestFailures = [];
    this.unexpected404s = [];
    this.pageErrors = [];
    this._requestsById.clear();
  }

  getUnexpected404s({ allowFaviconIco = false } = {}) {
    if (!allowFaviconIco) return [...this.unexpected404s];
    return this.unexpected404s.filter((r) => !/\/favicon\.ico(?:$|\?)/.test(r.url || ''));
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 960,
      screenWidth: width,
      screenHeight: height,
    });
    await sleep(60);
  }

  async setReducedMotion(enabled) {
    await this.send('Emulation.setEmulatedMedia', {
      features: enabled ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [],
    });
    await sleep(60);
  }

  async navigate(url, { waitFonts = true, settleMs = 180, ignoreStatusErrors = false } = {}) {
    this.clearLogs();
    this._intentional404Nav = Boolean(ignoreStatusErrors);

    let loadHandler = null;
    let sameDocHandler = null;
    let navTimer = null;
    const addListener = (method, fn) => {
      if (!this.eventListeners.has(method)) this.eventListeners.set(method, new Set());
      this.eventListeners.get(method).add(fn);
    };
    const removeListener = (method, fn) => {
      if (!fn) return;
      this.eventListeners.get(method)?.delete(fn);
    };

    try {
      let loadFired = false;
      let sameDocFired = false;
      let resolveLoad;
      let rejectLoad;
      const loadDone = new Promise((res, rej) => {
        resolveLoad = res;
        rejectLoad = rej;
      });
      loadHandler = () => {
        loadFired = true;
        clearTimeout(navTimer);
        resolveLoad('load');
      };
      sameDocHandler = (params) => {
        if (!this._mainFrameId || !params?.frameId || params.frameId === this._mainFrameId) {
          sameDocFired = true;
          clearTimeout(navTimer);
          resolveLoad('same-doc');
        }
      };
      addListener('Page.loadEventFired', loadHandler);
      addListener('Page.navigatedWithinDocument', sameDocHandler);
      navTimer = setTimeout(() => {
        rejectLoad(new Error(`Timed out waiting for navigation load on ${url}`));
      }, this.timeoutMs);

      const navRes = await this.send('Page.navigate', { url });
      if (navRes.frameId && !this._mainFrameId) {
        this._mainFrameId = navRes.frameId;
      }
      if (navRes.errorText && !ignoreStatusErrors) {
        clearTimeout(navTimer);
        throw new Error(`Page.navigate error for ${url}: ${navRes.errorText}`);
      }

      if (!navRes.loaderId && !loadFired) {
        if (!sameDocFired) {
          await Promise.race([loadDone, sleep(150)]);
        }
      } else {
        await loadDone;
      }
      clearTimeout(navTimer);

      if (waitFonts) {
        await this.evaluate('document.fonts ? document.fonts.ready.then(() => true) : true');
      }
      if (settleMs > 0) await sleep(settleMs);

      const docResponses = this.networkResponses.filter(
        (r) =>
          r.resourceType === 'Document' &&
          !r.isRedirect &&
          (!this._mainFrameId || !r.frameId || r.frameId === this._mainFrameId)
      );
      const docResp =
        docResponses[docResponses.length - 1] ||
        this.networkResponses.filter((r) => r.resourceType === 'Document' && !r.isRedirect).slice(-1)[0] ||
        null;

      let finalUrl = docResp?.url || url;
      try {
        finalUrl = (await this.evaluate('window.location.href')) || finalUrl;
      } catch {
        // ignore if context unavailable
      }

      return {
        url,
        finalUrl,
        documentStatus: docResp ? docResp.status : null,
        documentHeaders: docResp ? docResp.headers : {},
        networkResponses: [...this.networkResponses],
        requestFailures: [...this.requestFailures],
        unexpected404s: [...this.unexpected404s],
        pageErrors: [...this.pageErrors],
      };
    } finally {
      clearTimeout(navTimer);
      removeListener('Page.loadEventFired', loadHandler);
      removeListener('Page.navigatedWithinDocument', sameDocHandler);
      this._intentional404Nav = false;
    }
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      const desc =
        res.exceptionDetails.exception?.description ||
        res.exceptionDetails.text ||
        JSON.stringify(res.exceptionDetails);
      throw new Error(`Runtime.evaluate error: ${desc}`);
    }
    return res.result ? res.result.value : undefined;
  }

  async callFn(fn, ...args) {
    const serialized = args.map((a) => JSON.stringify(a)).join(',');
    const expr = `(${fn.toString()})(${serialized})`;
    return this.evaluate(expr);
  }

  async checkHorizontalOverflow(targetWidth) {
    return this.callFn((tw) => {
      const meta = document.querySelector('meta[name="viewport"]');
      const metaContent = meta ? meta.getAttribute('content') || '' : '';
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      const innerWidth = window.innerWidth;

      const protruding = [];
      const walk = document.querySelectorAll('body *');
      for (const el of walk) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        if (rect.right > tw + 1.5) {
          // Allow children inside explicit overflow-x scrollable widgets
          let p = el.parentElement;
          let insideScroller = false;
          while (p && p !== document.body) {
            const pcs = getComputedStyle(p);
            if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll') {
              insideScroller = true;
              break;
            }
            p = p.parentElement;
          }
          if (!insideScroller) {
            protruding.push({
              tag: el.tagName.toLowerCase(),
              text: (el.innerText || '').trim().slice(0, 40),
              right: Math.round(rect.right * 10) / 10,
            });
          }
        }
      }

      const viewportMatch =
        tw >= 960
          ? scrollWidth <= clientWidth &&
            clientWidth <= tw &&
            clientWidth >= tw - 24 &&
            innerWidth === tw
          : scrollWidth <= tw && clientWidth === tw && innerWidth === tw;

      const ok =
        viewportMatch &&
        metaContent.includes('width=device-width') &&
        protruding.length === 0;

      return {
        ok,
        targetWidth: tw,
        scrollWidth,
        innerWidth,
        clientWidth,
        metaContent,
        protruding: protruding.slice(0, 8),
      };
    }, targetWidth);
  }

  async assertNoHorizontalOverflow(targetWidth, contextLabel = '') {
    const res = await this.checkHorizontalOverflow(targetWidth);
    if (!res.ok) {
      throw new Error(
        `Horizontal overflow failed${contextLabel ? ` (${contextLabel})` : ''}: ` +
          JSON.stringify(res)
      );
    }
    return res;
  }

  async clickRect(rect) {
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(120);
  }

  async scrollToY(y) {
    await this.callFn((targetY) => {
      window.scrollTo({ top: targetY, behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    }, y);
    await sleep(180);
  }

  async wheel(deltaY, x = 200, y = 300) {
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x,
      y,
      deltaX: 0,
      deltaY,
    });
    await sleep(180);
  }

  async pressKey(key) {
    if (key === 'Enter') {
      await this.send('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
        text: '\r',
        unmodifiedText: '\r',
      });
      await this.send('Input.dispatchKeyEvent', {
        type: 'char',
        text: '\r',
        unmodifiedText: '\r',
      });
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
      });
    } else if (key === 'Space' || key === ' ') {
      await this.send('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        key: ' ',
        code: 'Space',
        windowsVirtualKeyCode: 32,
        nativeVirtualKeyCode: 32,
        text: ' ',
        unmodifiedText: ' ',
      });
      await this.send('Input.dispatchKeyEvent', {
        type: 'char',
        text: ' ',
        unmodifiedText: ' ',
      });
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: ' ',
        code: 'Space',
        windowsVirtualKeyCode: 32,
        nativeVirtualKeyCode: 32,
      });
    } else if (key === 'Tab') {
      await this.send('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
        nativeVirtualKeyCode: 9,
      });
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
        nativeVirtualKeyCode: 9,
      });
    } else if (key === 'Escape') {
      await this.send('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        key: 'Escape',
        code: 'Escape',
        windowsVirtualKeyCode: 27,
        nativeVirtualKeyCode: 27,
      });
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Escape',
        code: 'Escape',
        windowsVirtualKeyCode: 27,
        nativeVirtualKeyCode: 27,
      });
    } else {
      const codeMap = {
        ArrowLeft: { code: 'ArrowLeft', vk: 37 },
        ArrowUp: { code: 'ArrowUp', vk: 38 },
        ArrowRight: { code: 'ArrowRight', vk: 39 },
        ArrowDown: { code: 'ArrowDown', vk: 40 },
      };
      const meta = codeMap[key] || { code: key, vk: 0 };
      await this.send('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        key,
        code: meta.code,
        windowsVirtualKeyCode: meta.vk,
        nativeVirtualKeyCode: meta.vk,
      });
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key,
        code: meta.code,
        windowsVirtualKeyCode: meta.vk,
        nativeVirtualKeyCode: meta.vk,
      });
    }
    await sleep(100);
  }

  async mockJsonRoutes(routes) {
    this.mockRoutes = Array.isArray(routes) ? [...routes] : null;
    if (!this.fetchEnabled) {
      await this.send('Fetch.enable', {
        patterns: [{ urlPattern: '*', requestStage: 'Request' }],
      });
      this.fetchEnabled = true;
    }
  }

  async clearMockRoutes() {
    this.mockRoutes = null;
    if (this.fetchEnabled) {
      this.fetchEnabled = false;
      if (this.ws && this.ws.readyState === WebSocket.OPEN && this.sessionId) {
        try {
          await Promise.race([this.send('Fetch.disable'), sleep(800)]);
        } catch {
          // ignore if already closing
        }
      }
    }
  }

  async measureAccentRatio({ captureBeyondViewport = false } = {}) {
    const { data } = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport,
    });
    const buf = Buffer.from(data, 'base64');
    return analyzeAccentPixels(buf);
  }

  cleanupSync() {
    if (this._cleanedSync) return;
    this._cleanedSync = true;
    this.mockRoutes = null;
    this.fetchEnabled = false;
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    if (this.proc && !this.proc.killed && this.proc.exitCode === null) {
      try {
        this.proc.kill('SIGKILL');
      } catch {
        // ignore
      }
    }
    if (this.userDataDir) {
      try {
        fs.rmSync(this.userDataDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    activeClients.delete(this);
    if (activeClients.size === 0) detachSignalGuards();
  }

  async close() {
    if (this._closed) return;
    this._closed = true;
    await this.clearMockRoutes();
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        await Promise.race([this.sendBrowser('Browser.close'), sleep(1000)]);
      }
    } catch {
      // ignore close error
    }
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    if (this.proc && !this.proc.killed && this.proc.exitCode === null) {
      try {
        this.proc.kill('SIGTERM');
      } catch {
        // ignore
      }
      await Promise.race([
        new Promise((r) => this.proc.once('exit', r)),
        sleep(600),
      ]);
      if (this.proc.exitCode === null) {
        try {
          this.proc.kill('SIGKILL');
        } catch {
          // ignore
        }
      }
    }
    this._cleanedSync = true;
    if (this.userDataDir) {
      try {
        fs.rmSync(this.userDataDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }
    activeClients.delete(this);
    if (activeClients.size === 0) detachSignalGuards();
  }
}

export async function withCdp(options, fn) {
  const client = new CdpClient(options);
  try {
    await client.launch();
    return await fn(client);
  } finally {
    await client.close();
  }
}
