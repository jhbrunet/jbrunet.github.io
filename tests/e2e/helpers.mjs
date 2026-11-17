import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = path.join(__dirname, 'fixtures');

let cachedVectors = null;
export function loadExpectedVectors() {
  if (!cachedVectors) {
    cachedVectors = JSON.parse(
      fs.readFileSync(path.join(FIXTURES_DIR, 'expected_vectors.json'), 'utf8')
    );
  }
  return cachedVectors;
}

export function loadFixtureBin(name) {
  return fs.readFileSync(path.join(FIXTURES_DIR, name));
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createTierRunner(tierName, filterRegex = null) {
  const results = [];
  let passed = 0;
  let failed = 0;

  async function check(id, feature, title, fn) {
    if (filterRegex && !filterRegex.test(`${id} ${feature} ${title}`)) {
      return;
    }
    const t0 = performance.now();
    try {
      const detail = await fn();
      const durationMs = Math.round(performance.now() - t0);
      passed++;
      results.push({
        id,
        feature,
        title,
        status: 'PASS',
        durationMs,
        detail: typeof detail === 'string' ? detail : JSON.stringify(detail ?? 'ok'),
      });
    } catch (err) {
      const durationMs = Math.round(performance.now() - t0);
      failed++;
      results.push({
        id,
        feature,
        title,
        status: 'FAIL',
        durationMs,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function finish() {
    return {
      tier: tierName,
      passed,
      failed,
      total: passed + failed,
      results,
    };
  }

  return { check, finish };
}

export function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg || 'Assertion failed');
  }
}

export function assertClose2(actual, expected, msg = '') {
  const a = Number(actual);
  const e = Number(expected);
  if (!Number.isFinite(a) || Math.abs(Math.round(a * 100) - Math.round(e * 100)) > 0) {
    throw new Error(`${msg ? msg + ': ' : ''}expected ${e.toFixed(2)}, got ${actual}`);
  }
}

export async function apiJson(apiBaseUrl, endpoint, { method = 'GET', body = null } = {}) {
  const url = `${apiBaseUrl.replace(/\/$/, '')}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  const init = {
    method,
    headers: { Accept: 'application/json' },
  };
  if (body !== null) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const resp = await fetch(url, init);
  const contentType = resp.headers.get('content-type') || '';
  const text = await resp.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: resp.status, ok: resp.ok, contentType, text, json, headers: resp.headers };
}

export async function getBodyText(cdp) {
  return cdp.evaluate('document.body ? document.body.innerText : ""');
}

export async function waitForCondition(cdp, fnOrExpr, timeoutMs = 4000, intervalMs = 50) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  let lastVal = null;

  const evalOnce = async () => {
    if (typeof fnOrExpr === 'string') {
      return cdp.evaluate(fnOrExpr);
    }
    if (typeof fnOrExpr === 'function') {
      if (fnOrExpr.length >= 1) {
        return fnOrExpr(cdp);
      }
      const src = fnOrExpr.toString();
      if (/\b(document|window)\b/.test(src) && !/\bcdp\b/.test(src)) {
        return cdp.callFn(fnOrExpr);
      }
      try {
        return await fnOrExpr();
      } catch (err) {
        if (err instanceof ReferenceError && /\b(document|window|location|getComputedStyle)\b/.test(err.message)) {
          return cdp.callFn(fnOrExpr);
        }
        throw err;
      }
    }
    throw new Error('waitForCondition requires a function or JS expression string');
  };

  while (Date.now() < deadline) {
    try {
      const val = await evalOnce();
      lastVal = val;
      if (val) return val;
      lastErr = null;
    } catch (err) {
      lastErr = err?.message || String(err);
    }
    await sleep(intervalMs);
  }

  const label = typeof fnOrExpr === 'string' ? fnOrExpr.slice(0, 120) : (fnOrExpr?.name || 'predicate');
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for condition (${label})` +
      (lastErr ? `: ${lastErr}` : ` (last value: ${JSON.stringify(lastVal)})`)
  );
}

const FR_LOCALE_REGEX_STR =
  '\\b(EN\\s+DIRECT|ATHLÈTES|CALCUL|SALLE\\s+DE\\s+CHRONO|147\\s+INSCRIPTIONS|LE\\s+PARCOURS|PARTENAIRES|DÉPART|CHRONO\\s*\\/\\s*HUB|PORTE\\s+MANQUÉE|MANQUÉ\\s+UNE\\s+PORTE|ENTRAÎNEUR-CHEF|PÉNALITÉ|RÉSULTATS|RETOUR\\s+AU)\\b';

export async function setLocale(cdp, targetLocale) {
  const wantFr = String(targetLocale).toUpperCase() === 'FR';

  const detectIsFr = () =>
    cdp.callFn((frRegexStr) => {
      const docLang = (document.documentElement.lang || '').trim().toLowerCase();
      if (docLang.startsWith('fr')) return true;
      const bodyText = document.body?.innerText || '';
      return new RegExp(frRegexStr, 'i').test(bodyText);
    }, FR_LOCALE_REGEX_STR);

  const alreadyFr = await detectIsFr();
  if (wantFr === alreadyFr) {
    return { already: true, clicked: false };
  }

  const findVisibleLangBtn = () =>
    cdp.callFn((fr) => {
      const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
      const isVisible = (b) => {
        const cs = getComputedStyle(b);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const exactTarget = btns.find((b) => {
        if (!isVisible(b)) return false;
        const txt = (b.innerText || '').trim();
        const aria = (b.getAttribute('aria-label') || '').trim();
        const re = fr ? /^(FR|Français)$/i : /^(EN|English)$/i;
        return re.test(txt) || (!txt && re.test(aria));
      });
      if (exactTarget) {
        exactTarget.scrollIntoView({ block: 'center', inline: 'nearest' });
        const r = exactTarget.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height, label: (exactTarget.innerText || '').trim() };
      }
      const toggle = btns.find((b) => {
        if (!isVisible(b)) return false;
        const t = (b.innerText || '').trim();
        const al = (b.getAttribute('aria-label') || '').trim();
        return /EN\s*\/\s*FR|FR\s*\/\s*EN|lang|language|langue|bilingual/i.test(`${t} ${al}`);
      });
      if (toggle) {
        toggle.scrollIntoView({ block: 'center', inline: 'nearest' });
        const r = toggle.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height, label: (toggle.innerText || '').trim() };
      }
      return null;
    }, wantFr);

  let openedDrawer = false;
  let btnRect = await findVisibleLangBtn();

  if (!btnRect) {
    const menuRect = await cdp.callFn(() => {
      const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
      const menuBtn = btns.find((b) => {
        const cs = getComputedStyle(b);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        const r = b.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        const expanded = b.getAttribute('aria-expanded');
        if (expanded === 'false') return true;
        const txt = (b.innerText || '').trim();
        const al = (b.getAttribute('aria-label') || '').trim();
        return /\b(menu|nav)\b/i.test(`${txt} ${al}`);
      });
      if (!menuBtn) return null;
      const r = menuBtn.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
    if (menuRect) {
      await cdp.clickRect(menuRect);
      openedDrawer = true;
      btnRect = await waitForCondition(cdp, findVisibleLangBtn, 2000, 50);
    }
  }

  assert(btnRect, `Could not find visible language toggle button for locale=${targetLocale}`);
  await cdp.clickRect(btnRect);

  await waitForCondition(
    cdp,
    async () => (await detectIsFr()) === wantFr,
    3000,
    50
  );

  if (openedDrawer) {
    const stillOpen = await cdp.evaluate(
      'document.querySelector("[aria-expanded=\\"true\\"]") !== null'
    );
    if (stillOpen) {
      await cdp.pressKey('Escape');
      await waitForCondition(
        cdp,
        'document.querySelector("[aria-expanded=\\"true\\"]") === null',
        1500,
        50
      ).catch(() => {});
    }
  }

  const finalFr = await detectIsFr();
  assert(finalFr === wantFr, `setLocale(${targetLocale}) failed to switch page locale (isFr=${finalFr})`);
  return { already: false, clicked: true, label: btnRect.label };
}

export async function clickButtonMatching(cdp, regexStr, flags = 'i', containerSelector = null) {
  const findRect = () =>
    cdp.callFn(
      (pat, flg, containerSel) => {
        const re = new RegExp(pat, flg);
        let roots = [document];
        if (containerSel) {
          roots = Array.from(document.querySelectorAll(containerSel));
          if (roots.length === 0) return null;
        }
        const els = [];
        for (const root of roots) {
          els.push(...root.querySelectorAll('button, [role="tab"], [role="button"], a[href]'));
        }
        for (const el of els) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          const text = (el.innerText || '').trim();
          const ariaLabel = (el.getAttribute('aria-label') || '').trim();
          if (re.test(text) || (ariaLabel && re.test(ariaLabel))) {
            el.scrollIntoView({ block: 'center', inline: 'nearest' });
            const r2 = el.getBoundingClientRect();
            return {
              left: r2.left,
              top: r2.top,
              width: r2.width,
              height: r2.height,
              text,
            };
          }
        }
        return null;
      },
      regexStr,
      flags,
      containerSelector
    );

  let rect = await findRect();
  if (!rect) {
    rect = await waitForCondition(cdp, findRect, 2000, 50).catch(() => null);
  }
  assert(rect, `Could not find visible button/link matching /${regexStr}/${flags}${containerSelector ? ` inside ${containerSelector}` : ''}`);
  await cdp.clickRect(rect);
  return rect;
}

export async function fillFieldMatching(cdp, labelRegexStr, value, flagsOrOpts = 'i', containerSelector = null) {
  let flags = 'i';
  let containerSel = containerSelector;
  if (typeof flagsOrOpts === 'object' && flagsOrOpts !== null) {
    flags = flagsOrOpts.flags || 'i';
    containerSel = flagsOrOpts.containerSelector || flagsOrOpts.container || containerSelector;
  } else if (typeof flagsOrOpts === 'string') {
    flags = flagsOrOpts || 'i';
  }

  const tryFill = () =>
    cdp.callFn(
      (pat, flg, val, scopeSel) => {
        const re = new RegExp(pat, flg);
        let roots = [document];
        if (scopeSel) {
          try {
            roots = Array.from(document.querySelectorAll(scopeSel));
          } catch {
            const secRe = new RegExp(scopeSel, 'i');
            roots = Array.from(document.querySelectorAll('form, section')).filter((el) =>
              secRe.test(el.innerText || '')
            );
          }
          if (roots.length === 0) return false;
        }

        const inputs = [];
        for (const root of roots) {
          inputs.push(...root.querySelectorAll('input, select, textarea'));
        }

        const ownLabelText = (lbl) => {
          if (!lbl) return '';
          const clone = lbl.cloneNode(true);
          clone.querySelectorAll('input, select, textarea').forEach((n) => n.remove());
          return (clone.innerText || clone.textContent || '').trim();
        };

        const scoreInput = (el) => {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') return -1;
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return -1;

          let best = 0;
          const primaryLabels = [];
          if (el.id) {
            const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
            if (lbl) primaryLabels.push(ownLabelText(lbl));
          }
          const parentLbl = el.closest('label');
          if (parentLbl) primaryLabels.push(ownLabelText(parentLbl));
          if (el.getAttribute('aria-label')) primaryLabels.push(el.getAttribute('aria-label').trim());
          if (el.getAttribute('placeholder')) primaryLabels.push(el.getAttribute('placeholder').trim());
          if (el.getAttribute('name')) primaryLabels.push(el.getAttribute('name').trim());

          for (const lbl of primaryLabels) {
            if (!lbl) continue;
            if (re.test(lbl)) {
              const exactish = lbl.toLowerCase() === String(pat).toLowerCase().replace(/^\^|\$$/g, '');
              best = Math.max(best, exactish ? 120 : 100);
            }
          }

          const prev = el.previousElementSibling;
          if (prev && re.test((prev.innerText || '').trim())) {
            best = Math.max(best, 30);
          }

          const container = el.parentElement;
          if (container && container.querySelectorAll('input, select, textarea').length === 1) {
            if (re.test((container.innerText || '').trim())) {
              best = Math.max(best, 15);
            }
          }
          return best;
        };

        let target = null;
        let topScore = 0;
        for (const el of inputs) {
          const sc = scoreInput(el);
          if (sc > topScore) {
            topScore = sc;
            target = el;
          }
        }
        if (!target) return false;

        target.focus();
        let nextVal = String(val);
        if (target.tagName === 'SELECT') {
          const opts = Array.from(target.options);
          const exactOpt = opts.find((o) => o.value === nextVal);
          const ciOpt =
            exactOpt ||
            opts.find(
              (o) =>
                o.value.toLowerCase() === nextVal.toLowerCase() ||
                (o.text || '').trim().toLowerCase() === nextVal.toLowerCase()
            );
          if (!ciOpt) return false;
          nextVal = ciOpt.value;
        }

        const proto =
          target.tagName === 'SELECT'
            ? window.HTMLSelectElement.prototype
            : target.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(target, nextVal);
        else target.value = nextVal;

        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        target.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
      },
      labelRegexStr,
      flags,
      value,
      containerSel
    );

  let ok = await tryFill();
  if (!ok) {
    ok = await waitForCondition(cdp, tryFill, 2000, 50).catch(() => false);
  }
  assert(
    ok,
    `Could not find/fill form field matching /${labelRegexStr}/${flags}${containerSel ? ` inside ${containerSel}` : ''}`
  );
  await sleep(80);
}

export async function switchHubTab(cdp, tabNameRegexStr) {
  const findTabRect = () =>
    cdp.callFn((pat) => {
      const re = new RegExp(pat, 'i');
      const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
      for (const tab of tabs) {
        const cs = getComputedStyle(tab);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const txt = (tab.innerText || '').trim();
        const aria = (tab.getAttribute('aria-label') || '').trim();
        if (re.test(txt) || (aria && re.test(aria))) {
          tab.scrollIntoView({ block: 'center', inline: 'nearest' });
          const r = tab.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          return { left: r.left, top: r.top, width: r.width, height: r.height, text: txt || aria };
        }
      }
      return null;
    }, tabNameRegexStr);

  const res = await waitForCondition(cdp, findTabRect, 3000, 50);
  await cdp.clickRect(res);

  await waitForCondition(
    cdp,
    async () =>
      cdp.callFn((pat) => {
        const re = new RegExp(pat, 'i');
        const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
        const match = tabs.find((t) => {
          const txt = (t.innerText || '').trim();
          const aria = (t.getAttribute('aria-label') || '').trim();
          return re.test(txt) || (aria && re.test(aria));
        });
        if (!match || match.getAttribute('aria-selected') !== 'true') return false;
        const ctrlId = match.getAttribute('aria-controls');
        if (ctrlId) {
          const panel = document.getElementById(ctrlId);
          if (!panel || panel.hidden || getComputedStyle(panel).display === 'none') return false;
        }
        return true;
      }, tabNameRegexStr),
    3000,
    50
  );
}

export function buildSyntheticLiveRaceRoutes(vectors) {
  const b = vectors.synthetic_vectors.vector_b_990001_sentinels;
  const c = vectors.synthetic_vectors.vector_c_990002_hnr3;

  const syntheticDaily = {
    date: '2026-11-16',
    count: 5,
    sources: { live_timing_ok: true, fis_calendar_ok: true },
    races: [
      {
        lt_id: '990001',
        source_type: 'U',
        name: 'COUPE ÉLITE MONT-ÉDOUARD',
        discipline: 'Slalom',
        gender: 'Men',
        country: 'CAN',
        region: 'QUÉBEC',
        resort: 'Mont-Édouard',
        start_time: '11/16/2026 9:30 AM',
        zone_status: 'L',
        fis_codex: '9901',
        fis_race_id: null,
        fis_category: 'FIS',
        hide_times_mode: '0',
        has_pdf_report: false,
      },
      {
        lt_id: '990002',
        source_type: 'U',
        name: 'WITTENBURG 3-RUN SLALOM',
        discipline: 'Slalom',
        gender: 'Men',
        country: 'GER',
        region: 'MV',
        resort: 'Wittenburg',
        start_time: '11/16/2026 10:00 AM',
        zone_status: 'L',
        fis_codex: '0422',
        fis_race_id: '135605',
        fis_category: 'FIS',
        hide_times_mode: '0',
        has_pdf_report: false,
      },
      {
        lt_id: '990003',
        source_type: 'U',
        name: 'RESORT RESTRICTED RUN 2',
        discipline: 'Giant Slalom',
        gender: 'Men',
        country: 'USA',
        region: 'UT',
        resort: 'Park City',
        start_time: '11/16/2026 10:30 AM',
        zone_status: 'L',
        fis_codex: '9903',
        fis_race_id: null,
        fis_category: 'FIS',
        hide_times_mode: '1',
        has_pdf_report: false,
      },
      {
        lt_id: '990004',
        source_type: 'U',
        name: 'RESORT RESTRICTED ALL',
        discipline: 'Slalom',
        gender: 'Women',
        country: 'USA',
        region: 'CO',
        resort: 'Copper',
        start_time: '11/16/2026 11:00 AM',
        zone_status: 'L',
        fis_codex: '9904',
        fis_race_id: null,
        fis_category: 'FIS',
        hide_times_mode: '2',
        has_pdf_report: false,
      },
      {
        lt_id: '131463',
        source_type: 'U',
        name: 'CERRO CASTOR 2XMAX TEST',
        discipline: 'Slalom',
        gender: 'Women',
        country: 'ARG',
        region: 'TF',
        resort: 'Cerro Castor',
        start_time: '7/30/2026 10:00 AM',
        zone_status: 'R',
        fis_codex: '5256',
        fis_race_id: '131463',
        fis_category: 'FIS',
        hide_times_mode: '0',
        has_pdf_report: true,
      },
    ],
  };

  const race990001 = {
    lt_id: '990001',
    server_stamp: '794866900.00000',
    online: true,
    refresh_seconds: 5,
    num_runs: 2,
    hide_times_mode: '0',
    race: {
      name: 'COUPE ÉLITE MONT-ÉDOUARD',
      discipline: 'SL',
      gender: 'M',
      resort: 'Mont-Édouard',
      start_time: '11/16/2026 9:30 AM',
      fis_codex: '9901',
      category: 'FIS',
      f_value: 730,
      max_points: 165.0,
      adder: 8.0,
    },
    penalty: {
      status: 'LIVE',
      provisional_calc: b.applied,
      raw_calc: b.raw,
      adder: 8.0,
      z_value: 0.0,
      applied_penalty: b.applied,
      category_min: 23.0,
      category_max: 999.0,
      clamped: false,
      double_max_triggered: false,
      sum_a: b.sum_a,
      sum_b: b.sum_b,
      sum_c: b.sum_c,
      a_pool: [
        { bib: 6, name: 'SAVOIE, Luc', fis_points: 25.0, race_points: 0.0 },
        { bib: 7, name: 'MORIN, Hugo', fis_points: 30.0, race_points: 8.3 },
        { bib: 8, name: 'ROY, Félix', fis_points: 35.0, race_points: 16.59 },
        { bib: 9, name: 'DUPUIS, Noah', fis_points: 40.0, race_points: 24.89 },
        { bib: 10, name: 'FORTIN, Sam', fis_points: 45.0, race_points: 33.18 },
      ],
      b_pool: [
        { bib: 2, name: 'GAGNÉ, Léo', fis_points: 12.0, status: 'DNS2' },
        { bib: 3, name: 'CÔTÉ, Marc', fis_points: 15.0, status: 'DNF1' },
        { bib: 4, name: 'BÉLANGER, Félix', fis_points: 18.0, status: 'DNF2' },
        { bib: 5, name: 'LAFOND, Rémi', fis_points: 20.0, status: 'DQg42' },
        { bib: 11, name: 'ROCHON, Ève', fis_points: 22.0, status: 'ON_COURSE' },
      ],
      finishers_count: b.finishers_count,
      starters_count: b.starters_count,
      confidence_note: 'On Course: Bib 11 ROCHON, Ève (DNS1 Bib 1 excluded)',
      threats: [{ bib: 11, name: 'ROCHON, Ève', fis_points: 22.0, r1_ms: 44200, status: 'ON_COURSE' }],
    },
    leader_time_ms: 88000,
    racers: [
      {
        bib: 6, name: 'SAVOIE, Luc', nation: 'CAN', club: 'EDOUA', category_class: 'SR',
        fis_code: '9900016', fis_points: 25.0, points_enriched: false,
        r1_display: '44.00', r1_ms: 44000, r2_display: '44.00', r2_ms: 44000,
        r3_display: null, r3_ms: null, total_display: '1:28.00', total_ms: 88000,
        rank: 1, status: 'FIN', is_on_course: false, elapsed_live_ms: null,
        intermediates_cs: {}, speeds: {}, race_points: 0.0, expected_fis_points: 25.9,
      },
      {
        bib: 7, name: 'MORIN, Hugo', nation: 'CAN', club: 'EDOUA', category_class: 'SR',
        fis_code: '9900017', fis_points: 30.0, points_enriched: false,
        r1_display: '44.50', r1_ms: 44500, r2_display: '44.50', r2_ms: 44500,
        r3_display: null, r3_ms: null, total_display: '1:29.00', total_ms: 89000,
        rank: 2, status: 'FIN', is_on_course: false, elapsed_live_ms: null,
        intermediates_cs: {}, speeds: {}, race_points: 8.3, expected_fis_points: 34.2,
      },
      {
        bib: 11, name: 'ROCHON, Ève', nation: 'CAN', club: 'QUÉBEC', category_class: 'SR',
        fis_code: '9900021', fis_points: 22.0, points_enriched: false,
        r1_display: '44.20', r1_ms: 44200, r2_display: 'On Course', r2_ms: null,
        r3_display: null, r3_ms: null, total_display: 'On Course', total_ms: null,
        rank: null, status: 'ON_COURSE', is_on_course: true, elapsed_live_ms: 15000,
        intermediates_cs: {}, speeds: {}, race_points: null, expected_fis_points: null,
      },
      {
        bib: 1, name: 'TREMBLAY, Éric', nation: 'CAN', club: 'QUÉBEC', category_class: 'SR',
        fis_code: '9900011', fis_points: 10.0, points_enriched: false,
        r1_display: 'DNS', r1_ms: null, r2_display: 'DNS', r2_ms: null,
        r3_display: null, r3_ms: null, total_display: 'DNS1', total_ms: null,
        rank: null, status: 'DNS1', is_on_course: false, elapsed_live_ms: null,
        intermediates_cs: {}, speeds: {}, race_points: null, expected_fis_points: null,
      },
      {
        bib: 5, name: 'LAFOND, Rémi', nation: 'CAN', club: 'QUÉBEC', category_class: 'SR',
        fis_code: '9900015', fis_points: 20.0, points_enriched: false,
        r1_display: 'DQg42', r1_ms: null, r2_display: 'DNS', r2_ms: null,
        r3_display: null, r3_ms: null, total_display: 'DQg42', total_ms: null,
        rank: null, status: 'DQg42', is_on_course: false, elapsed_live_ms: null,
        intermediates_cs: {}, speeds: {}, race_points: null, expected_fis_points: null,
      },
    ],
  };

  const race990002 = {
    lt_id: '990002',
    server_stamp: '794866910.00000',
    online: false,
    refresh_seconds: 30,
    num_runs: 3,
    hide_times_mode: '0',
    race: {
      name: 'WITTENBURG 3-RUN SLALOM',
      discipline: 'SL',
      gender: 'M',
      resort: 'Wittenburg',
      start_time: '11/16/2026 10:00 AM',
      fis_codex: '0422',
      category: 'FIS',
      f_value: 730,
      max_points: 165.0,
      adder: 8.0,
    },
    penalty: {
      status: 'PROVISIONAL',
      provisional_calc: c.applied,
      raw_calc: c.raw,
      adder: 8.0,
      z_value: 0.0,
      applied_penalty: c.applied,
      category_min: 23.0,
      category_max: 999.0,
      clamped: false,
      double_max_triggered: false,
      sum_a: c.sum_a,
      sum_b: c.sum_b,
      sum_c: c.sum_c,
      a_pool: [],
      b_pool: [],
      finishers_count: 5,
      starters_count: 5,
      confidence_note: '3-run SL complete',
      threats: [],
    },
    leader_time_ms: 75000,
    racers: [
      {
        bib: 1, name: 'MÜLLER, Jan', nation: 'GER', club: 'SC', category_class: 'SR',
        fis_code: '9900031', fis_points: 25.0, points_enriched: false,
        r1_display: '25.00', r1_ms: 25000, r2_display: '25.00', r2_ms: 25000,
        r3_display: '25.00', r3_ms: 25000, total_display: '1:15.00', total_ms: 75000,
        rank: 1, status: 'FIN', is_on_course: false, elapsed_live_ms: null,
        intermediates_cs: { i11: 615 }, speeds: {}, race_points: 0.0, expected_fis_points: 33.27,
      },
      {
        bib: 2, name: 'SCHMIDT, Paul', nation: 'GER', club: 'SC', category_class: 'SR',
        fis_code: '9900032', fis_points: 30.0, points_enriched: false,
        r1_display: '25.30', r1_ms: 25300, r2_display: '25.40', r2_ms: 25400,
        r3_display: '25.30', r3_ms: 25300, total_display: '1:16.00', total_ms: 76000,
        rank: 2, status: 'FIN', is_on_course: false, elapsed_live_ms: null,
        intermediates_cs: {}, speeds: {}, race_points: 9.73, expected_fis_points: 43.0,
      },
    ],
  };

  const race990003 = {
    lt_id: '990003',
    server_stamp: '794866920.00000',
    online: false,
    refresh_seconds: 30,
    num_runs: 2,
    hide_times_mode: '1',
    restriction_notice: 'Resort restriction active (hHT=1): Run 2 and combined totals hidden by host.',
    race: {
      name: 'RESORT RESTRICTED RUN 2',
      discipline: 'GS',
      gender: 'M',
      resort: 'Park City',
      start_time: '11/16/2026 10:30 AM',
      fis_codex: '9903',
      category: 'FIS',
      f_value: 1010,
      max_points: 220.0,
      adder: 8.0,
    },
    penalty: {
      status: 'RESTRICTED',
      provisional_calc: null,
      raw_calc: null,
      adder: 8.0,
      z_value: 0.0,
      applied_penalty: null,
      category_min: 23.0,
      category_max: 999.0,
      clamped: false,
      double_max_triggered: false,
      sum_a: null,
      sum_b: null,
      sum_c: null,
      a_pool: [],
      b_pool: [],
      finishers_count: 2,
      starters_count: 2,
      confidence_note: 'Run 2 & totals hidden by resort (hHT=1)',
      threats: [],
    },
    leader_time_ms: null,
    racers: [
      {
        bib: 1, name: 'SMITH, Alex', nation: 'USA', club: 'PCSS', category_class: 'SR',
        fis_code: '9900041', fis_points: 25.0, points_enriched: false,
        r1_display: '52.10', r1_ms: 52100, r2_display: null, r2_ms: null,
        r3_display: null, r3_ms: null, total_display: null, total_ms: null,
        rank: null, status: 'R1_ONLY', is_on_course: false, elapsed_live_ms: null,
        intermediates_cs: {}, speeds: {}, race_points: null, expected_fis_points: null,
      },
    ],
  };

  const race990004 = {
    lt_id: '990004',
    server_stamp: '794866930.00000',
    online: false,
    refresh_seconds: 30,
    num_runs: 2,
    hide_times_mode: '2',
    restriction_notice: 'Resort restriction active (hHT=2): All times and ranks hidden by host.',
    race: {
      name: 'RESORT RESTRICTED ALL',
      discipline: 'SL',
      gender: 'W',
      resort: 'Copper',
      start_time: '11/16/2026 11:00 AM',
      fis_codex: '9904',
      category: 'FIS',
      f_value: 730,
      max_points: 165.0,
      adder: 8.0,
    },
    penalty: {
      status: 'RESTRICTED',
      provisional_calc: null,
      raw_calc: null,
      adder: 8.0,
      z_value: 0.0,
      applied_penalty: null,
      category_min: 23.0,
      category_max: 999.0,
      clamped: false,
      double_max_triggered: false,
      sum_a: null,
      sum_b: null,
      sum_c: null,
      a_pool: [],
      b_pool: [],
      finishers_count: 0,
      starters_count: 2,
      confidence_note: 'All times hidden by resort (hHT=2)',
      threats: [],
    },
    leader_time_ms: null,
    racers: [
      {
        bib: 1, name: 'MILLER, Kate', nation: 'USA', club: 'SUMMIT', category_class: 'SR',
        fis_code: '9900051', fis_points: 26.0, points_enriched: false,
        r1_display: null, r1_ms: null, r2_display: null, r2_ms: null,
        r3_display: null, r3_ms: null, total_display: null, total_ms: null,
        rank: null, status: 'HIDDEN', is_on_course: false, elapsed_live_ms: null,
        intermediates_cs: {}, speeds: {}, race_points: null, expected_fis_points: null,
      },
    ],
  };

  const race131463 = {
    lt_id: '131463',
    server_stamp: '794866950.00000',
    online: false,
    refresh_seconds: 30,
    num_runs: 2,
    hide_times_mode: '0',
    race: {
      name: 'CERRO CASTOR 2XMAX TEST',
      discipline: 'SL',
      gender: 'W',
      resort: 'Cerro Castor',
      start_time: '7/30/2026 10:00 AM',
      fis_codex: '5256',
      category: 'FIS',
      f_value: 730,
      max_points: 165.0,
      adder: 8.0,
    },
    penalty: {
      status: 'OFFICIAL',
      provisional_calc: 330.0,
      raw_calc: 97.55,
      adder: 8.0,
      z_value: 0.0,
      applied_penalty: 330.0,
      category_min: 23.0,
      category_max: 999.0,
      clamped: false,
      double_max_triggered: true,
      sum_a: 673.68,
      sum_b: 461.24,
      sum_c: 159.42,
      a_pool: [],
      b_pool: [],
      finishers_count: 4,
      starters_count: 5,
      confidence_note: '<3 FIS point finishers -> 2xMaxPoints floor (330.00)',
      threats: [],
    },
    leader_time_ms: 86500,
    racers: [
      {
        bib: 1, name: 'BOGNI BARRY, Sofia', nation: 'ARG', club: 'CASTOR', category_class: 'SR',
        fis_code: '35328', fis_points: 58.67, points_enriched: false,
        r1_display: '43.10', r1_ms: 43100, r2_display: '43.40', r2_ms: 43400,
        r3_display: null, r3_ms: null, total_display: '1:26.50', total_ms: 86500,
        rank: 1, status: 'FIN', is_on_course: false, elapsed_live_ms: null,
        intermediates_cs: {}, speeds: {}, race_points: 0.0, expected_fis_points: 330.0,
      },
      {
        bib: 2, name: 'PIGNATON FAGNANI, Carlotta', nation: 'ITA', club: 'CASTOR', category_class: 'SR',
        fis_code: '85037', fis_points: null, points_enriched: false,
        r1_display: '45.50', r1_ms: 45500, r2_display: '45.53', r2_ms: 45530,
        r3_display: null, r3_ms: null, total_display: '1:31.03', total_ms: 91030,
        rank: 2, status: 'FIN', is_on_course: false, elapsed_live_ms: null,
        intermediates_cs: {}, speeds: {}, race_points: 38.23, expected_fis_points: 368.23,
      },
    ],
  };

  return [
    {
      match: /\/api\/hub\/races(\?|$)/,
      body: (url) => {
        if (url.includes('2026-11-16')) return syntheticDaily;
        return syntheticDaily;
      },
    },
    { match: /\/api\/hub\/races\/990001\/live/, body: race990001 },
    { match: /\/api\/hub\/races\/990002\/live/, body: race990002 },
    { match: /\/api\/hub\/races\/990003\/live/, body: race990003 },
    { match: /\/api\/hub\/races\/990004\/live/, body: race990004 },
    { match: /\/api\/hub\/races\/131463\/live/, body: race131463 },
  ];
}

export async function openSyntheticRaceInHub(cdp, apiUrl, baseUrl, vectors, raceRegexStr) {
  const probe = await apiJson(apiUrl, '/races/990001/live');
  const nativeSynthetic = probe.status === 200;
  if (!nativeSynthetic) {
    await cdp.mockJsonRoutes(buildSyntheticLiveRaceRoutes(vectors));
  }
  await cdp.navigate(`${baseUrl}/hub`);
  await fillFieldMatching(cdp, 'DATE', nativeSynthetic ? '2026-11-15' : '2026-11-16');

  await waitForCondition(
    cdp,
    async () =>
      cdp.callFn((pat) => {
        const re = new RegExp(pat, 'i');
        return Array.from(document.querySelectorAll('button, [role="button"], a[href]')).some((el) => {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') return false;
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return false;
          const txt = (el.innerText || '').trim();
          const aria = (el.getAttribute('aria-label') || '').trim();
          return re.test(txt) || (aria && re.test(aria));
        });
      }, raceRegexStr),
    4000,
    50
  );

  await clickButtonMatching(cdp, raceRegexStr);

  await waitForCondition(
    cdp,
    async () =>
      cdp.callFn(() => {
        const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
        const raceTab = tabs.find((t) => /\b(RACE|COURSE)\b/i.test((t.innerText || '').trim()));
        if (!raceTab || raceTab.getAttribute('aria-selected') !== 'true') return false;
        const ctrlId = raceTab.getAttribute('aria-controls');
        const panel = ctrlId ? document.getElementById(ctrlId) : document.querySelector('[role="tabpanel"]:not([hidden])');
        if (!panel || panel.hidden || getComputedStyle(panel).display === 'none') return false;
        const text = panel.innerText || '';
        return /\b(PROVISIONAL|OFFICIAL|LIVE|RESTRICTED)\b/i.test(text) || /restricted|hidden/i.test(text);
      }),
    4000,
    50
  );

  return { usedFetchMock: !nativeSynthetic };
}

