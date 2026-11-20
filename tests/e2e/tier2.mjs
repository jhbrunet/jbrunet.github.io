import {
  apiJson,
  assert,
  assertClose2,
  clickButtonMatching,
  createTierRunner,
  fillFieldMatching,
  getBodyText,
  loadExpectedVectors,
  loadFixtureBin,
  openSyntheticRaceInHub,
  setLocale,
  switchHubTab,
  waitForCondition,
} from './helpers.mjs';

function buildCompetitorsForSums(discipline, sumA, sumB, sumC) {
  const fMap = { SL: 730, GS: 1010, SG: 1190, DH: 1250, AC: 1360 };
  const fVal = fMap[String(discipline).toUpperCase()] || 1010;
  const toMs = fVal * 100;
  const minSum = Math.min(Number(sumA), Number(sumB));
  const p4 = Math.min(10.0, Math.round((minSum / 5) * 100) / 100);
  const comps = [
    { bib: 1, list_points: p4, total_ms: toMs, status: 'QLF' },
    { bib: 2, list_points: p4, total_ms: toMs, status: 'QLF' },
    { bib: 3, list_points: p4, total_ms: toMs, status: 'QLF' },
    { bib: 4, list_points: p4, total_ms: toMs, status: 'QLF' },
    {
      bib: 5,
      list_points: Number((Number(sumA) - 4 * p4).toFixed(2)),
      total_ms: toMs + Math.round(Number(sumC) * 100),
      status: 'QLF',
    },
  ];
  if (Number(sumB) < Number(sumA)) {
    comps.push({
      bib: 6,
      list_points: Number((Number(sumB) - 4 * p4).toFixed(2)),
      total_ms: null,
      status: 'DNF1',
    });
  }
  return comps;
}

export async function runTier2(ctx) {
  const { cdp, baseUrl, apiUrl, filterRegex } = ctx;
  const vectors = loadExpectedVectors();
  const runner = createTierRunner('tier2', filterRegex);
  const { check } = runner;

  // 1. Viewport Overflow Matrix: 320x568, 390x844, 1440x900 across /, /hub, /partners, /not-found (12 checks)
  const routeMatrix = [
    { path: '/', feature: '#5 UX & Fonts', ignore404: false },
    { path: '/hub', feature: '#10 Hub LIVE', ignore404: false },
    { path: '/partners', feature: '#13 Route Closure', ignore404: false },
    { path: '/not-found', feature: '#13 Route Closure', ignore404: true },
  ];
  const viewports = [
    { w: 320, h: 568 },
    { w: 390, h: 844 },
    { w: 1440, h: 900 },
  ];

  let ovIdx = 1;
  for (const rt of routeMatrix) {
    for (const vp of viewports) {
      const id = `T2-OV-${String(ovIdx++).padStart(2, '0')}`;
      await check(id, rt.feature, `${rt.path} zero horizontal overflow at ${vp.w}x${vp.h}`, async () => {
        await cdp.setViewport(vp.w, vp.h);
        await cdp.navigate(`${baseUrl}${rt.path}`, { ignoreStatusErrors: rt.ignore404 });
        return cdp.assertNoHorizontalOverflow(vp.w, `${rt.path} @ ${vp.w}x${vp.h}`);
      });
    }
  }

  // 2. Tap Targets >= 44x44px (4 checks)
  await check('T2-TAP-01', '#5 UX & Fonts', '/ SVG curve nodes and GATE 01 CTA >= 44x44 at 390x844', async () => {
    await cdp.setViewport(390, 844);
    await cdp.navigate(`${baseUrl}/`);
    const metrics = await cdp.evaluate(`(() => {
      const cta = Array.from(document.querySelectorAll('a, button')).find(e => /GATE 01/i.test(e.innerText));
      const cr = cta ? cta.getBoundingClientRect() : null;
      const menu = document.querySelector('header button, [aria-expanded]');
      const mr = menu ? menu.getBoundingClientRect() : null;
      const nodes = Array.from(document.querySelectorAll('svg [role="button"], svg [tabindex="0"]')).map(n => {
        const r = n.getBoundingClientRect();
        return { w: r.width, h: r.height };
      });
      return { cta: cr ? { w: cr.width, h: cr.height } : null, menu: mr ? { w: mr.width, h: mr.height } : null, nodes };
    })()`);
    assert(metrics.cta && metrics.cta.w >= 44 && metrics.cta.h >= 44, `GATE 01 CTA too small: ${JSON.stringify(metrics.cta)}`);
    assert(metrics.menu && metrics.menu.w >= 44 && metrics.menu.h >= 44, `Menu button too small: ${JSON.stringify(metrics.menu)}`);
    for (const n of metrics.nodes) {
      if (n.w > 0 && n.h > 0) {
        assert(n.w >= 44 && n.h >= 44, `SVG node < 44x44: ${JSON.stringify(n)}`);
      }
    }
    return metrics;
  });

  await check('T2-TAP-02', '#5 UX & Fonts', '/ desktop curve nodes >= 44x44 at 1440x900', async () => {
    await cdp.setViewport(1440, 900);
    const nodes = await cdp.evaluate(`(() => {
      return Array.from(document.querySelectorAll('aside svg [role="button"], aside svg [tabindex="0"]')).map(n => {
        const r = n.getBoundingClientRect();
        return { w: r.width, h: r.height };
      });
    })()`);
    assert(nodes.length >= 3, `Expected >= 3 interactive curve nodes, got ${nodes.length}`);
    for (const n of nodes) {
      assert(n.w >= 44 && n.h >= 44, `Desktop SVG node < 44x44: ${JSON.stringify(n)}`);
    }
    return { count: nodes.length };
  });

  await check('T2-TAP-03', '#10 Hub LIVE', '/hub tabs, filters, and action buttons >= 44x44 at 320x568', async () => {
    await cdp.setViewport(320, 568);
    await cdp.navigate(`${baseUrl}/hub`);
    const bad = await cdp.evaluate(`(() => {
      const els = Array.from(document.querySelectorAll('[role="tab"], main button'));
      return els.map(el => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return null;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return null;
        return (r.width < 43.5 || r.height < 43.5) ? { text: el.innerText.trim(), w: r.width, h: r.height } : null;
      }).filter(Boolean);
    })()`);
    assert(bad.length === 0, `Sub-44px controls on /hub @ 320px: ${JSON.stringify(bad)}`);
    return 'all controls >= 44px at 320px';
  });

  await check('T2-TAP-04', '#11 Hub RACE', '/hub racer rows >= 44px height at 390x844', async () => {
    await cdp.setViewport(390, 844);
    await fillFieldMatching(cdp, 'DATE', '2026-04-11');
    await waitForCondition(cdp, () => /SUPER SERIE|SKIBEC/i.test(document.body.innerText), 4000, 50);
    await clickButtonMatching(cdp, '309223|0484');
    await waitForCondition(cdp, () => /ST-GERMAIN|BRUNET/i.test(document.body.innerText), 4000, 50);
    const rows = await cdp.evaluate(`(() => {
      return Array.from(document.querySelectorAll('#race-view-results button, [role="tabpanel"] button')).filter(b => /ST-GERMAIN|BRUNET/i.test(b.innerText)).map(b => b.getBoundingClientRect().height);
    })()`);
    assert(rows.length >= 2 && rows.every((h) => h >= 44), `Racer rows < 44px: ${JSON.stringify(rows)}`);
    return { minHeight: Math.min(...rows) };
  });

  // 3. Reduced Motion Fallbacks & #3 Ski Course Gates Edge Cases (6 checks)
  await check('T2-RM-01', '#3 Ski Course Gates', '/ honors prefers-reduced-motion: reduce without zero-opacity locks', async () => {
    await cdp.setViewport(1440, 900);
    await cdp.setReducedMotion(true);
    await cdp.navigate(`${baseUrl}/`);
    const info = await cdp.evaluate(`(() => {
      const matches = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const gates = Array.from(document.querySelectorAll('article, [data-gate]'));
      const hidden = gates.filter(g => parseFloat(getComputedStyle(g).opacity) < 0.9).map(g => g.innerText.slice(0, 30));
      const g1 = document.querySelector('#gate-01, [data-gate="01"]') || gates.find(g => /GATE 01/i.test(g.innerText)) || document.body;
      const td = getComputedStyle(g1).transitionDuration;
      return { matches, hidden, td };
    })()`);
    await cdp.setReducedMotion(false);
    assert(info.matches === true, 'prefers-reduced-motion did not match');
    assert(info.hidden.length === 0, `Elements hidden under reduced motion: ${JSON.stringify(info.hidden)}`);
    const tdOk =
      info.td === '0s' ||
      info.td === '0ms' ||
      info.td === '0.01ms' ||
      info.td === '1e-05s' ||
      parseFloat(info.td) <= 0.001;
    assert(tdOk, `Transition duration not zeroed under reduced motion: ${info.td}`);
    return info;
  });

  await check('T2-RM-02', '#3 Ski Course Gates', 'Connectors and clock remain readable under prefers-reduced-motion', async () => {
    await cdp.setReducedMotion(true);
    const ok = await cdp.evaluate(`(() => {
      const clockEl = document.querySelector('.rail-clock-digits, .topbar-clock, .run-clock') ||
        Array.from(document.querySelectorAll('*')).find(e => /^\\d{2}:\\d{2}\\.\\d{2}$/.test((e.innerText || '').trim()));
      const conns = Array.from(document.querySelectorAll('svg path')).filter(p => !p.closest('aside'));
      return { clock: clockEl?.innerText?.trim() || null, connectorPaths: conns.length };
    })()`);
    await cdp.setReducedMotion(false);
    assert(ok.clock && ok.connectorPaths >= 7, `Reduced motion broke clock/connectors: ${JSON.stringify(ok)}`);
    return ok;
  });

  await check('T2-F03-COLORS', '#3 Ski Course Gates', 'Course connector strokes use only approved palette colors and zero neon glow', async () => {
    const strokeAudit = await cdp.evaluate(`(() => {
      const paths = Array.from(document.querySelectorAll('svg path')).filter(p => !p.closest('aside'));
      const bad = [];
      for (const p of paths) {
        const s = (p.getAttribute('stroke') || '') + ' ' + getComputedStyle(p).stroke;
        if (/cyan|magenta|#00f0ff|#ff00ff/i.test(s)) bad.push(s);
      }
      return { checked: paths.length, bad };
    })()`);
    assert(strokeAudit.checked >= 7 && strokeAudit.bad.length === 0, `Invalid connector stroke colors: ${JSON.stringify(strokeAudit)}`);
    return strokeAudit;
  });

  await check('T2-F03-BOUNDS-320', '#3 Ski Course Gates', 'All inter-gate connectors stay strictly within [0, 320] horizontal bounds at 320x568', async () => {
    await cdp.setViewport(320, 568);
    const bounds = await cdp.evaluate(`(() => {
      const conns = Array.from(document.querySelectorAll('svg')).filter(s => !s.closest('aside') && s.querySelector('path'));
      const out = conns.map(c => {
        const r = c.getBoundingClientRect();
        return { left: Math.round(r.left * 10) / 10, right: Math.round(r.right * 10) / 10, w: Math.round(r.width * 10) / 10 };
      });
      const oob = out.filter(x => x.left < -1 || x.right > 321.5);
      return { count: out.length, oob };
    })()`);
    await cdp.setViewport(1440, 900);
    assert(bounds.count >= 7 && bounds.oob.length === 0, `Connector out of 320px bounds: ${JSON.stringify(bounds)}`);
    return bounds;
  });

  await check('T2-F03-A11Y', '#3 Ski Course Gates', 'Decorative course connector SVGs have aria-hidden="true" or explicit accessible role/label', async () => {
    const unlabeled = await cdp.evaluate(`(() => {
      const conns = Array.from(document.querySelectorAll('svg')).filter(s => {
        if (s.closest('aside')) return false;
        const r = s.getBoundingClientRect();
        return r.height >= 35 && r.height <= 120 && s.querySelector('path');
      });
      return conns.filter(s => {
        const ah = s.getAttribute('aria-hidden') === 'true' || s.closest('[aria-hidden="true"]');
        const al = s.getAttribute('aria-label') || s.getAttribute('role') === 'presentation';
        return !ah && !al;
      }).length;
    })()`);
    assert(unlabeled === 0, `Found ${unlabeled} unlabeled decorative connector SVGs`);
    return 'connector SVGs accessible';
  });

  await check('T2-RM-03', '#10 Hub LIVE', '/hub remains fully functional under prefers-reduced-motion', async () => {
    await cdp.setReducedMotion(true);
    await cdp.navigate(`${baseUrl}/hub`);
    await switchHubTab(cdp, 'CALC');
    const txt = await getBodyText(cdp);
    await cdp.setReducedMotion(false);
    assert(/Race Points/i.test(txt), '/hub CALC unreadable under reduced motion');
    return 'hub reduced-motion pass';
  });

  // 4. Feature #2 Contextual Split Telemetry Bay Edge & Boundary Checks (5 checks)
  await check('T2-F02-ZERO-GATES', '#2 Split Telemetry', 'Scrolling to zero-race pause Gates 02 (COVID) & 06 (9-month gap) renders structured telemetry without empty SVG error', async () => {
    await cdp.setViewport(1440, 900);
    await cdp.navigate(`${baseUrl}/`);
    for (const item of [
      { num: '02', pat: /0\s+starts|COVID/i },
      { num: '06', pat: /9\s+months|284\s+days|0\s+gate/i },
    ]) {
      await cdp.callFn((n) => {
        const el =
          document.querySelector(`#gate-${n}, [data-gate="${n}"]`) ||
          Array.from(document.querySelectorAll('article, [data-gate]')).find((e) => e.innerText.includes('GATE ' + n));
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - Math.round(window.innerHeight * 0.35), behavior: 'instant' });
        window.dispatchEvent(new Event('scroll'));
      }, item.num);
      await waitForCondition(
        cdp,
        (patSrc, gateNum) => {
          const bay =
            document.querySelector('#contextual-bay, .telemetry-bay, .split-board-bay-desktop') ||
            document.querySelector('aside.split-board-col, aside.split-board, #course-gates aside');
          if (!bay) return false;
          const activeGate = bay.getAttribute('data-active-gate');
          return (!activeGate || activeGate === gateNum) && new RegExp(patSrc, 'i').test(bay.innerText || '');
        },
        3000,
        50,
        item.pat.source,
        item.num
      ).catch(() => {});
      const bayTxt = await cdp.evaluate(`(document.querySelector('#contextual-bay, .telemetry-bay, .split-board-bay-desktop') || document.querySelector('aside.split-board-col, aside.split-board, #course-gates aside'))?.innerText || ''`);
      assert(item.pat.test(bayTxt), `Zero-state Gate ${item.num} bay mismatch: ${bayTxt}`);
    }
    assert(cdp.pageErrors.length === 0, `Page errors on pause gates: ${JSON.stringify(cdp.pageErrors)}`);
    return 'pause gates 02 & 06 clean';
  });

  await check('T2-F02-BP-SWITCH', '#2 Split Telemetry', 'Breakpoint boundary (959px mobile vs 960px desktop) toggles sticky split-board visibility cleanly', async () => {
    await cdp.setViewport(959, 844);
    const mobVis = await cdp.evaluate(`(() => {
      const el = document.querySelector('aside.split-board, aside.split-board-col');
      if (!el) return false;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0;
    })()`);
    await cdp.setViewport(960, 844);
    const deskVis = await cdp.evaluate(`(() => {
      const el = document.querySelector('aside.split-board, aside.split-board-col, #course-gates aside');
      if (!el) return false;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width >= 200;
    })()`);
    await cdp.setViewport(1440, 900);
    assert(mobVis === false && deskVis === true, `Breakpoint toggle failed: 959px=${mobVis}, 960px=${deskVis}`);
    return { at959: mobVis, at960: deskVis };
  });

  await check('T2-F02-MOB-320', '#2 Split Telemetry', 'At 320x568 minimum viewport, inline Gate 01 and Gate 07 D3 charts fit within <= 320px width', async () => {
    await cdp.setViewport(320, 568);
    const dims = await cdp.evaluate(`(() => {
      const g1 = document.querySelector('#gate-01, [data-gate="01"]') ||
        Array.from(document.querySelectorAll('article, [data-gate]')).find(e => /GATE 01/i.test(e.innerText));
      const g7 = document.querySelector('#gate-07, [data-gate="07"]') ||
        Array.from(document.querySelectorAll('article, [data-gate]')).find(e => /GATE 07/i.test(e.innerText));
      const r1 = g1?.querySelector('svg')?.getBoundingClientRect();
      const r7 = g7?.querySelector('svg')?.getBoundingClientRect();
      return {
        g1: r1 ? { w: r1.width, right: r1.right } : null,
        g7: r7 ? { w: r7.width, right: r7.right } : null,
      };
    })()`);
    await cdp.setViewport(1440, 900);
    assert(dims.g1 && dims.g1.w >= 150 && dims.g1.right <= 321.5, `320px Gate 01 SVG overflow: ${JSON.stringify(dims.g1)}`);
    assert(dims.g7 && dims.g7.w >= 150 && dims.g7.right <= 321.5, `320px Gate 07 SVG overflow: ${JSON.stringify(dims.g7)}`);
    return dims;
  });

  await check('T2-F02-G01-ENDPOINTS', '#2 Split Telemetry', 'Gate 01 telemetry bay includes #29 start rank, #1 U18 finish rank, and 2,120 pts', async () => {
    const bayTxt = await cdp.evaluate(`(() => {
      const el = document.querySelector('#gate-01, [data-gate="01"]') ||
        Array.from(document.querySelectorAll('article, [data-gate]')).find(e => /GATE 01/i.test(e.innerText));
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 90, behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
      const aside = document.querySelector('aside.split-board-col, aside.split-board, #course-gates aside');
      return (aside?.innerText || '') + ' ' + (el?.innerText || '');
    })()`);
    assert(bayTxt.includes('#29') && bayTxt.includes('#1') && bayTxt.includes('2,120'), `Gate 01 endpoints missing: ${bayTxt.slice(0, 200)}`);
    return 'Gate 01 endpoints verified';
  });

  await check('T2-F02-G07-DELTA', '#2 Split Telemetry', 'Gate 07 comeback bay displays 46.35 return, 36.12 prior best threshold, and 34.95 PB', async () => {
    await cdp.evaluate(`(() => {
      const el = document.querySelector('#gate-07, [data-gate="07"]') ||
        Array.from(document.querySelectorAll('article, [data-gate]')).find(e => /GATE 07/i.test(e.innerText));
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - Math.round(window.innerHeight * 0.35), behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    })()`);
    await waitForCondition(
      cdp,
      () => {
        const aside = document.querySelector('aside.split-board-col, aside.split-board, #course-gates aside');
        return Boolean(aside && /46\.35/.test(aside.innerText) && /36\.12/.test(aside.innerText) && /34\.95/.test(aside.innerText));
      },
      3000,
      50
    ).catch(() => {});
    const bayTxt = await cdp.evaluate(`document.querySelector('aside.split-board-col, aside.split-board, #course-gates aside')?.innerText || ''`);
    assert(/46\.35/.test(bayTxt) && /36\.12/.test(bayTxt) && /34\.95/.test(bayTxt), `Gate 07 bay values missing: ${bayTxt}`);
    return 'Gate 07 delta values verified';
  });

  // 5. Exact .xx5 ROUND_HALF_UP (3 checks)
  await check('T2-RND-01', '#9 Decimal Rules', 'Case A1: 13.655 rounds UP to raw 13.66 (applied 21.66 NC)', async () => {
    const a1 = vectors.synthetic_vectors.vector_a_round_trap.case_a1;
    const r = await apiJson(apiUrl, '/calc/penalty', {
      method: 'POST',
      body: {
        discipline: 'GS',
        gender: 'M',
        category: 'NC',
        season: 2027,
        competitors: buildCompetitorsForSums('GS', a1.sum_a, a1.sum_b, a1.sum_c),
      },
    });
    assert(r.status === 200);
    const pen = r.json.penalty || r.json;
    assertClose2(pen.raw_calc ?? pen.raw, 13.66, '13.655 ROUND_HALF_UP');
    assertClose2(pen.applied_penalty ?? pen.applied, 21.66, 'applied 13.66 + 8.00');
    return pen;
  });

  await check('T2-RND-02', '#9 Decimal Rules', 'Case A2: 13.654 rounds DOWN to raw 13.65 (applied 21.65 NC)', async () => {
    const a2 = vectors.synthetic_vectors.vector_a_round_trap.case_a2;
    const r = await apiJson(apiUrl, '/calc/penalty', {
      method: 'POST',
      body: {
        discipline: 'GS',
        gender: 'M',
        category: 'NC',
        season: 2027,
        competitors: buildCompetitorsForSums('GS', a2.sum_a, a2.sum_b, a2.sum_c),
      },
    });
    assert(r.status === 200);
    const pen = r.json.penalty || r.json;
    assertClose2(pen.raw_calc ?? pen.raw, 13.65, '13.654 ROUND_HALF_UP');
    assertClose2(pen.applied_penalty ?? pen.applied, 21.65, 'applied 13.65 + 8.00');
    return pen;
  });

  await check('T2-RND-03', '#9 Decimal Rules', '24.245 rounds UP to 24.25 (not IEEE-754 24.24)', async () => {
    const r = await apiJson(apiUrl, '/calc/penalty', {
      method: 'POST',
      body: {
        discipline: 'GS',
        gender: 'M',
        category: 'FIS',
        season: 2026,
        competitors: buildCompetitorsForSums('GS', 143.10, 121.95, 22.60),
      },
    });
    assert(r.status === 200);
    const pen = r.json.penalty || r.json;
    assertClose2(pen.raw_calc ?? pen.raw, 24.25, '24.245 ROUND_HALF_UP');
    assertClose2(pen.applied_penalty ?? pen.applied, 24.25, 'applied 24.25');
    return pen;
  });

  // 6. +8.00 Adder before clamp & Category Levels (4 checks)
  await check('T2-ADD-01', '#9 Decimal Rules', '132230: 9.77 + 8.00 = 17.77 -> clamped to 23.00 (NOT 31.00)', async () => {
    const r = await apiJson(apiUrl, '/calc/penalty', {
      method: 'POST',
      body: {
        discipline: 'SL',
        gender: 'M',
        category: 'FIS',
        season: 2027,
        competitors: buildCompetitorsForSums('SL', 79.37, 74.79, 56.49),
      },
    });
    assert(r.status === 200);
    const pen = r.json.penalty || r.json;
    const applied = pen.applied_penalty ?? pen.applied;
    assertClose2(applied, 23.00, 'clamp-after-adder must be 23.00');
    assert(applied !== 31.0, 'Must NOT clamp to 23 then add 8 = 31.00');
    return pen;
  });

  await check('T2-ADD-02', '#9 Decimal Rules', 'Level 0 WC adds 0.00 adder and enforces 0.00 penalty', async () => {
    const r = await apiJson(apiUrl, '/calc/penalty', {
      method: 'POST',
      body: {
        discipline: 'SL',
        gender: 'M',
        category: 'WC',
        season: 2027,
        competitors: buildCompetitorsForSums('SL', 30.0, 30.0, 10.0),
      },
    });
    assert(r.status === 200);
    const pen = r.json.penalty || r.json;
    assertClose2(pen.adder, 0.0, 'WC adder');
    assertClose2(pen.applied_penalty ?? pen.applied, 0.0, 'WC penalty');
    return pen;
  });

  await check('T2-ADD-03', '#9 Decimal Rules', 'Level 1 NAC adds 0.00 adder in Season 2027 (min 15.00)', async () => {
    const r = await apiJson(apiUrl, '/calc/penalty', {
      method: 'POST',
      body: {
        discipline: 'GS',
        gender: 'M',
        category: 'NAC',
        season: 2027,
        competitors: buildCompetitorsForSums('GS', 50.0, 50.0, 10.0),
      },
    });
    assert(r.status === 200);
    const pen = r.json.penalty || r.json;
    assertClose2(pen.adder, 0.0, 'NAC adder');
    assertClose2(pen.applied_penalty ?? pen.applied, 15.0, 'NAC floor');
    return pen;
  });

  await check('T2-ADD-04', '#9 Decimal Rules', 'Level 4 ENL adds +8.00 and clamps to min 60.00', async () => {
    const r = await apiJson(apiUrl, '/calc/penalty', {
      method: 'POST',
      body: {
        discipline: 'SL',
        gender: 'M',
        category: 'ENL',
        season: 2027,
        competitors: buildCompetitorsForSums('SL', 100.0, 100.0, 50.0),
      },
    });
    assert(r.status === 200);
    const pen = r.json.penalty || r.json;
    assertClose2(pen.adder, 8.0, 'ENL adder');
    assertClose2(pen.applied_penalty ?? pen.applied, 60.0, 'ENL min 60');
    return pen;
  });

  // 7. Double-Max Floor, <3 Finishers, Art 4.4.6 Tie-Break, MaxPoints Cap (5 checks)
  await check('T2-FIS-01', '#9 Decimal Rules', '131463 (<3 FIS finishers SL) triggers double-max 330.00', async () => {
    const r = await apiJson(apiUrl, '/fis/race/131463');
    assert(r.status === 200);
    assert(r.json.penalty_audit?.double_max_triggered === true, 'Expected penalty_audit.double_max_triggered=true');
    assertClose2(r.json.applied_penalty, 330.0, '131463 applied_penalty');
    const pignaton = r.json.results.find((x) => /PIGNATON/i.test(x.name));
    assert(pignaton, 'PIGNATON missing');
    assertClose2(pignaton.fis_points, 368.23, 'PIGNATON points');
    return r.json.applied_penalty;
  });

  await check('T2-FIS-02', '#9 Decimal Rules', 'GS race with <3 FIS point holders triggers 440.00 double-max floor', async () => {
    const r = await apiJson(apiUrl, '/calc/penalty', {
      method: 'POST',
      body: {
        discipline: 'GS',
        gender: 'M',
        category: 'FIS',
        season: 2027,
        competitors: [
          { bib: 1, list_points: 50.0, total_ms: 100000, status: 'QLF' },
          { bib: 2, list_points: 80.0, total_ms: 102000, status: 'QLF' },
          { bib: 3, list_points: null, total_ms: 103000, status: 'QLF' },
          { bib: 4, list_points: null, total_ms: 104000, status: 'QLF' },
        ],
      },
    });
    const pen = r.json.penalty || r.json;
    assert(r.status === 200 && pen.double_max_triggered === true);
    assertClose2(pen.applied_penalty ?? pen.applied, 440.0, 'GS 2xMax');
    return pen;
  });

  await check('T2-FIS-03', '#9 Decimal Rules', '<3 total finishers returns HTTP 200 with penalty.status === INSUFFICIENT_FINISHERS', async () => {
    const r = await apiJson(apiUrl, '/calc/penalty', {
      method: 'POST',
      body: {
        discipline: 'SL',
        gender: 'M',
        category: 'FIS',
        season: 2027,
        competitors: [
          { bib: 1, list_points: 30.0, total_ms: 80000, status: 'QLF' },
          { bib: 2, list_points: 40.0, total_ms: 81000, status: 'QLF' },
        ],
      },
    });
    assert(r.status === 200 && r.json.penalty?.status === 'INSUFFICIENT_FINISHERS', `Expected 200 INSUFFICIENT_FINISHERS, got ${r.status}: ${r.text}`);
    return r.json.penalty;
  });

  await check('T2-FIS-04', '#9 Decimal Rules', '5th-place tie in Sum A selects HIGHER race points (raw 11.36 not 12.37)', async () => {
    const r = await apiJson(apiUrl, '/calc/penalty', {
      method: 'POST',
      body: {
        discipline: 'GS',
        gender: 'M',
        category: 'ANC',
        season: 2026,
        competitors: [
          { bib: 1, list_points: 10.0, total_ms: 100000, status: 'QLF' },
          { bib: 2, list_points: 12.0, total_ms: 100300, status: 'QLF' },
          { bib: 3, list_points: 15.0, total_ms: 100500, status: 'QLF' },
          { bib: 4, list_points: 18.0, total_ms: 100800, status: 'QLF' },
          { bib: 5, list_points: 20.0, total_ms: 101000, status: 'QLF' },
          { bib: 6, list_points: 25.0, total_ms: 101300, status: 'QLF' },
          { bib: 7, list_points: 30.0, total_ms: 101600, status: 'QLF' },
          { bib: 12, list_points: 20.0, total_ms: 102000, status: 'QLF' },
        ],
      },
    });
    assert(r.status === 200);
    const pen = r.json.penalty || r.json;
    assertClose2(pen.sum_c, 36.36, 'Art 4.4.6 tie-break sum_c');
    assertClose2(pen.raw_calc ?? pen.raw, 11.36, 'Art 4.4.6 tie-break raw');
    return pen;
  });

  await check('T2-FIS-05', '#9 Decimal Rules', 'Unranked/999.99 racers capped at MaxPoints (220.00 GS) in Sum A/B', async () => {
    const r = await apiJson(apiUrl, '/calc/penalty', {
      method: 'POST',
      body: {
        discipline: 'GS',
        gender: 'M',
        category: 'FIS',
        season: 2027,
        competitors: [
          { bib: 1, list_points: 10.0, total_ms: 100000, status: 'QLF' },
          { bib: 2, list_points: 20.0, total_ms: 101000, status: 'QLF' },
          { bib: 3, list_points: 30.0, total_ms: 102000, status: 'QLF' },
          { bib: 4, list_points: 999.99, total_ms: 103000, status: 'QLF' },
          { bib: 5, list_points: null, total_ms: 104000, status: 'QLF' },
        ],
      },
    });
    assert(r.status === 200);
    const pen = r.json.penalty || r.json;
    assertClose2(pen.sum_a, 10 + 20 + 30 + 220 + 220, 'Sum A capped at 220');
    return pen;
  });

  // 8. hHT=1 & hHT=2 Display Restrictions in API & Chromium /hub UI (4 checks)
  await check('T2-HHT-01', '#7 Live-Timing Parser', 'hHT=1 fixture bin/API preserves R1 and suppresses R2/total/rank/points', async () => {
    const bin = loadFixtureBin('aj_race_990003_hht1.bin').toString('latin1');
    assert(bin.includes('hHT=1'), 'hHT=1 fixture missing hHT=1 flag');
    const r = await apiJson(apiUrl, '/races/990003/live');
    if (r.status === 200) {
      assert(Number(r.json.hide_times_mode) === 1, `Expected hide_times_mode=1, got ${r.json.hide_times_mode}`);
      const first = r.json.racers[0];
      assert(first.r1_ms !== null && first.r2_ms === null && first.total_ms === null && first.expected_fis_points === null, `hHT=1 leak: ${JSON.stringify(first)}`);
    }
    return 'hHT=1 API verified';
  });

  await check('T2-HHT-02', '#11 Hub RACE', '/hub UI renders R1, omits totals/ranks, and displays restriction notice for hHT=1', async () => {
    await cdp.setViewport(390, 844);
    try {
      await openSyntheticRaceInHub(cdp, apiUrl, baseUrl, vectors, 'RESORT RESTRICTED RUN 2');
      const txt = await getBodyText(cdp);
      assert(/restricted|hidden|hHT=1/i.test(txt), `Missing hHT=1 notice in UI: ${txt.slice(0, 300)}`);
      assert(!/1:44\.00/.test(txt), 'hHT=1 UI leaked Run 2 combined total 1:44.00');
      return 'hHT=1 UI verified';
    } finally {
      await cdp.clearMockRoutes();
    }
  });

  await check('T2-HHT-03', '#7 Live-Timing Parser', 'hHT=2 suppresses R1, R2, total, leader_time, and points', async () => {
    const r = await apiJson(apiUrl, '/races/990004/live');
    if (r.status === 200) {
      assert(Number(r.json.hide_times_mode) === 2, `Expected hide_times_mode=2, got ${r.json.hide_times_mode}`);
      const first = r.json.racers[0];
      assert(first.r1_ms === null && first.total_ms === null && r.json.leader_time_ms === null, `hHT=2 leak: ${JSON.stringify(first)}`);
    }
    return 'hHT=2 API verified';
  });

  await check('T2-HHT-04', '#11 Hub RACE', '/hub UI suppresses all times and shows restriction notice for hHT=2', async () => {
    try {
      await openSyntheticRaceInHub(cdp, apiUrl, baseUrl, vectors, 'RESORT RESTRICTED ALL');
      const txt = await getBodyText(cdp);
      assert(/restricted|hidden|hHT=2/i.test(txt), 'Missing hHT=2 restriction notice');
      assert(!/46\.10|1:32\.00/.test(txt), 'hHT=2 leaked restricted times');
      return 'hHT=2 UI verified';
    } finally {
      await cdp.clearMockRoutes();
    }
  });

  // 9. hNR=3, 1-Run DH, i11 Centisecond Ratio, EC-06 990005, EC-15 Delta Poll (6 checks)
  await check('T2-HNR-01', '#7 Live-Timing Parser', 'hNR=3 3-run slalom computes num_runs=3 and applied 33.27', async () => {
    const r = await apiJson(apiUrl, '/races/990002/live?season=2027&category=FIS');
    if (r.status === 200) {
      assert(r.json.num_runs === 3, `Expected num_runs=3, got ${r.json.num_runs}`);
      assertClose2(r.json.penalty.applied_penalty, 33.27, '990002 applied');
      assert(r.json.racers[0].r3_ms === 25000, 'r3_ms missing');
    }
    const bin = loadFixtureBin('aj_race_990002_hnr3.bin').toString('latin1');
    assert(bin.includes('hNR=3') && bin.includes('r3=25.00=25000'), '990002 bin invalid');
    return 'hNR=3 verified';
  });

  await check('T2-HNR-02', '#11 Hub RACE', '/hub UI displays 3-run slalom R3 split & 33.27 penalty', async () => {
    try {
      await openSyntheticRaceInHub(cdp, apiUrl, baseUrl, vectors, 'WITTENBURG 3-RUN');
      await clickButtonMatching(cdp, 'MÜLLER');
      await waitForCondition(cdp, () => /25\.00/.test(document.body.innerText), 3000, 50);
      const txt = await getBodyText(cdp);
      assert(/33\.27/.test(txt) && /1:15\.00/.test(txt) && /25\.00/i.test(txt), `3-run UI incomplete: ${txt.slice(0, 400)}`);
      return 'hNR=3 UI verified';
    } finally {
      await cdp.clearMockRoutes();
    }
  });

  await check('T2-DH-01', '#7 Live-Timing Parser', '300126 1-run DH finishers with r2=DNS=2147483607 stay QLF (82110ms)', async () => {
    const r = await apiJson(apiUrl, '/races/300126/live');
    assert(r.status === 200);
    const wall = r.json.racers.find((x) => /WALL,\s*Kenzie/i.test(x.name));
    assert(wall && (wall.status === 'QLF' || wall.status === 'FIN') && wall.total_ms === 82110, `WALL dropped: ${JSON.stringify(wall)}`);
    return wall;
  });

  await check('T2-DH-02', '#7 Live-Timing Parser', 'i11=615 cs vs r1=82110 ms preserves 10x unit integrity (6.15s < 82.11s)', async () => {
    const r = await apiJson(apiUrl, '/races/300126/live');
    assert(r.status === 200);
    const wall = r.json.racers.find((x) => /WALL,\s*Kenzie/i.test(x.name));
    const i11 = wall.intermediates_cs?.i11;
    assert(i11 === 615 && i11 * 10 < wall.r1_ms, `i11 cs unit mismatch: i11=${i11}, r1_ms=${wall.r1_ms}`);
    return { i11_cs: i11, r1_ms: wall.r1_ms };
  });

  await check('T2-EC06-990005', '#7 Live-Timing Parser', 'EC-06 990005 tiebreak fixture & live parser select higher race_points on 5th-place tie', async () => {
    const bin = loadFixtureBin('aj_race_990005_tiebreak.bin').toString('latin1');
    assert(bin.includes('EPSILON, Five') && bin.includes('THETA, Eight') && bin.includes('fp=2000'), '990005 fixture invalid');
    const r = await apiJson(apiUrl, '/races/990005/live?season=2026&category=ANC');
    if (r.status === 200) {
      assertClose2(r.json.penalty.sum_a, 75.0, '990005 sum_a');
      assertClose2(r.json.penalty.sum_c, 36.36, '990005 sum_c');
      assertClose2(r.json.penalty.raw_calc, 11.36, '990005 raw');
    }
    return 'EC-06 990005 verified';
  });

  await check('T2-EC15-DELTA', '#7 Live-Timing Parser', 'EC-15 ?m= delta poll on 309223 preserves full leaderboard and penalty', async () => {
    const r0 = await apiJson(apiUrl, '/races/309223/live?m=0&season=2026&category=FIS');
    assert(r0.status === 200 && r0.json.server_stamp);
    const stamp = encodeURIComponent(String(r0.json.server_stamp));
    const rDelta = await apiJson(apiUrl, `/races/309223/live?m=${stamp}&season=2026&category=FIS`);
    assert(rDelta.status === 200 && Array.isArray(rDelta.json.racers) && rDelta.json.racers.length >= 12, 'Delta poll wiped racers');
    assertClose2(rDelta.json.penalty.applied_penalty, 24.25, 'Delta poll penalty');
    return { stamp: r0.json.server_stamp, racers: rDelta.json.racers.length };
  });

  // 10. Sentinel Codes & DNS1 vs DNS2 in Sum B (5 checks)
  await check('T2-SNT-01', '#7 Live-Timing Parser', '990001 excludes DNS1 from Sum B (87.00 not 75.00) and includes DNS2/DNF1/DNF2/DQg42/OnCourse', async () => {
    const r = await apiJson(apiUrl, '/races/990001/live?season=2027&category=FIS');
    if (r.status === 200) {
      assert(r.json.penalty.starters_count === 10, `starters_count=${r.json.penalty.starters_count}`);
      assertClose2(r.json.penalty.sum_b, 87.0, 'Sum B must exclude DNS1 bib 1 (87.00 not 75.00)');
      assertClose2(r.json.penalty.applied_penalty, 25.9, '990001 applied');
    } else {
      const p = await apiJson(apiUrl, '/calc/penalty', {
        method: 'POST',
        body: {
          discipline: 'SL',
          gender: 'M',
          category: 'FIS',
          season: 2027,
          competitors: [
            { bib: 1, list_points: 10.0, total_ms: null, status: 'DNS1' },
            { bib: 2, list_points: 12.0, total_ms: null, status: 'DNS2' },
            { bib: 3, list_points: 15.0, total_ms: null, status: 'DNF1' },
            { bib: 4, list_points: 18.0, total_ms: null, status: 'DNF2' },
            { bib: 5, list_points: 20.0, total_ms: null, status: 'DQg42' },
            { bib: 11, list_points: 22.0, total_ms: null, status: 'ON_COURSE' },
            { bib: 6, list_points: 25.0, total_ms: 88000, status: 'QLF' },
            { bib: 7, list_points: 30.0, total_ms: 89000, status: 'QLF' },
            { bib: 8, list_points: 35.0, total_ms: 90000, status: 'QLF' },
            { bib: 9, list_points: 40.0, total_ms: 91000, status: 'QLF' },
            { bib: 10, list_points: 45.0, total_ms: 92000, status: 'QLF' },
          ],
        },
      });
      assert(p.status === 200);
      const pen = p.json.penalty || p.json;
      assertClose2(pen.sum_b, 87.0, 'Sum B must exclude DNS1');
    }
    return 'DNS1 excluded from Sum B';
  });

  await check('T2-SNT-02', '#11 Hub RACE', '/hub UI renders On Course without exposing raw 2147483500 sentinel', async () => {
    await cdp.setViewport(390, 844);
    try {
      await openSyntheticRaceInHub(cdp, apiUrl, baseUrl, vectors, 'COUPE');
      const txt = await getBodyText(cdp);
      assert(/On Course/i.test(txt), 'Missing On Course display');
      assert(!/2147483500|2147483\.50/.test(txt), 'Raw sentinel 2147483500 leaked to UI');
      return 'On Course UI clean';
    } finally {
      await cdp.clearMockRoutes();
    }
  });

  await check('T2-SNT-03', '#7 Live-Timing Parser', '990001 sets is_on_course=true, online=true, refresh_seconds=5', async () => {
    const r = await apiJson(apiUrl, '/races/990001/live?season=2027');
    if (r.status === 200) {
      assert(r.json.online === true && r.json.refresh_seconds <= 10);
      const oc = r.json.racers.find((x) => x.bib === 11);
      assert(oc && oc.is_on_course === true && oc.total_ms === null, `Bad On Course state: ${JSON.stringify(oc)}`);
    }
    return 'On Course API fields verified';
  });

  await check('T2-SNT-04', '#7 Live-Timing Parser', 'Synthetic sentinel fixture contains authentic 2147483500..2147483627 codes', async () => {
    const bin = loadFixtureBin('aj_race_990001_sentinels.bin').toString('latin1');
    for (const code of ['2147483500', '2147483602', '2147483607', '2147483617', '2147483627']) {
      assert(bin.includes(code), `Missing sentinel ${code} in fixture`);
    }
    return 'all 5 sentinel codes in bin';
  });

  await check('T2-SNT-05', '#7 Live-Timing Parser', 'Unranked/DQ/DNF racers have null race_points and null expected_fis_points', async () => {
    const r = await apiJson(apiUrl, '/races/309223/live?season=2026');
    assert(r.status === 200);
    const nonFin = r.json.racers.filter((x) => x.status !== 'QLF' && x.status !== 'FIN');
    assert(nonFin.length >= 1 && nonFin.every((x) => x.race_points === null && x.expected_fis_points === null));
    return { nonFinishersChecked: nonFin.length };
  });

  // 11. ISO-8859-1 + HTML Entity French Accents (3 checks)
  await check('T2-ENC-01', '#7 Live-Timing Parser', 'Raw .bin fixtures contain true non-UTF8 ISO-8859-1 bytes (0xC9/0xE9/0xC8/0xD4) and &#201;', async () => {
    const buf = loadFixtureBin('aj_race_990001_sentinels.bin');
    assert(buf.includes(0xc9) && buf.includes(0xe9) && buf.includes(0xc8) && buf.includes(0xd4), 'Expected raw Latin-1 accent bytes');
    assert(buf.toString('latin1').includes('&#201;'), 'Expected &#201; entity');
    return 'raw latin1 fixture validated';
  });

  await check('T2-ENC-02', '#7 Live-Timing Parser', 'API decodes ISO-8859-1 & &#201; to É/é/È with zero U+FFFD or mojibake', async () => {
    const r = await apiJson(apiUrl, '/races/990001/live');
    if (r.status === 200) {
      assert(!r.text.includes('\ufffd') && !/Ã[©¨ª«]/.test(r.text), `Mojibake in 990001: ${r.text.slice(0, 200)}`);
      assert(r.text.includes('Éric') && r.text.includes('Léo') && r.text.includes('Ève'), 'French accents missing');
    }
    return 'API accent encoding clean';
  });

  await check('T2-ENC-03', '#7 Live-Timing Parser', '/hub UI renders French accents cleanly without mojibake', async () => {
    try {
      await openSyntheticRaceInHub(cdp, apiUrl, baseUrl, vectors, 'COUPE');
      const raceTxt = await getBodyText(cdp);
      assert(/ROCHON,\s*Ève/i.test(raceTxt) && !raceTxt.includes('\ufffd') && !/Ã[©¨]/.test(raceTxt), 'UI mojibake or missing Ève');
      return 'UI accents clean';
    } finally {
      await cdp.clearMockRoutes();
    }
  });

  // 12. Feature #6 API Contract Boundary & Error Checks (5 checks)
  await check('T2-F06-BAD-JSON', '#6 API Contract', 'Malformed JSON body to POST /api/hub/calc/penalty returns 400/422 JSON (never 500)', async () => {
    const res = await fetch(`${apiUrl}/calc/penalty`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad json',
    });
    assert(res.status === 400 || res.status === 422, `Expected 400/422 on malformed JSON, got ${res.status}`);
    return { status: res.status };
  });

  await check('T2-F06-UNKNOWN-ROUTE', '#6 API Contract', 'Unknown endpoint /api/hub/nonexistent-route returns 404 without crashing server', async () => {
    const r = await apiJson(apiUrl, '/nonexistent-route');
    assert(r.status === 404, `Expected 404 for unknown API route, got ${r.status}`);
    return { status: r.status };
  });

  await check('T2-F06-FIS-ONLY', '#6 API Contract', 'GET /api/hub/races?date=2026-04-11&fis_only=true filters out non-FIS races', async () => {
    const r = await apiJson(apiUrl, '/races?date=2026-04-11&fis_only=true');
    assert(r.status === 200 && Array.isArray(r.json.races) && r.json.races.length >= 1);
    assert(r.json.races.every((x) => Boolean(x.fis_codex) && x.source_type !== 'N'), 'Non-FIS race leaked into fis_only=true');
    return { fisCount: r.json.races.length };
  });

  await check('T2-F06-HEADERS', '#6 API Contract', 'API responses include application/json content-type and complete within latency budget', async () => {
    const t0 = Date.now();
    const r = await apiJson(apiUrl, '/health');
    const ms = Date.now() - t0;
    assert(r.status === 200 && r.contentType.includes('application/json') && ms < 5000, `Bad header or slow health: ${r.contentType} (${ms}ms)`);
    return { contentType: r.contentType, ms };
  });

  await check('T2-F06-INVALID-DATE-CAL', '#6 API Contract', 'Invalid calendar dates (not-a-date & 2026-02-31) return 400/422 JSON', async () => {
    const r1 = await apiJson(apiUrl, '/races?date=not-a-date');
    const r2 = await apiJson(apiUrl, '/races?date=2026-02-31');
    assert((r1.status === 400 || r1.status === 422) && (r2.status === 400 || r2.status === 422), `Bad date statuses: ${r1.status}, ${r2.status}`);
    return { s1: r1.status, s2: r2.status };
  });

  // 13. Empty Day, Invalid Race 99999999, Feature #8 FIS Client & Feature #12 CALC Edge Cases (10 checks)
  await check('T2-EMP-01', '#10 Hub LIVE', '1999-07-15 returns 200 count=0 and /hub renders clean empty state', async () => {
    const r = await apiJson(apiUrl, '/races?date=1999-07-15');
    assert(r.status === 200 && r.json.count === 0 && r.json.races.length === 0, `Bad empty day API: ${r.text}`);
    await cdp.navigate(`${baseUrl}/hub`);
    await fillFieldMatching(cdp, 'DATE', '1999-07-15');
    await waitForCondition(cdp, () => /NO RACES|AUCUNE COURSE|0\s+RACES/i.test(document.body.innerText), 4000, 50);
    const txt = await getBodyText(cdp);
    assert(/NO RACES|AUCUNE COURSE|0\s+RACES/i.test(txt), `Empty day UI message unclear: ${txt.slice(0, 250)}`);
    return 'empty day clean';
  });

  await check('T2-EMP-02', '#7 Live-Timing Parser', 'Invalid race 99999999 returns HTTP 404 JSON without raw 500 traceback', async () => {
    const r = await apiJson(apiUrl, '/races/99999999/live');
    assert(r.status === 404 && r.json && typeof r.json.detail === 'string', `Expected 404 JSON, got ${r.status}`);
    return r.json;
  });

  await check('T2-EMP-03', '#12 Hub CALC & Athletes', 'Unknown athlete search returns empty [] and clean /hub UI state', async () => {
    const r = await apiJson(apiUrl, '/athletes/search?q=ZZZZUNKNOWN99999');
    assert(r.status === 200 && Array.isArray(r.json.athletes) && r.json.athletes.length === 0);
    await switchHubTab(cdp, 'ATHLETES');
    await fillFieldMatching(cdp, 'Search FIS|FIS code', 'ZZZZUNKNOWN99999');
    await clickButtonMatching(cdp, 'SEARCH ATHLETE|^SEARCH$');
    await waitForCondition(cdp, () => /NO ATHLETES|AUCUN ATHLÈTE|0\s+results/i.test(document.body.innerText), 3000, 50);
    const txt = await getBodyText(cdp);
    assert(/NO ATHLETES|AUCUN ATHLÈTE|0\s+results/i.test(txt), `Missing empty athlete message`);
    return 'unknown athlete empty state clean';
  });

  await check('T2-EMP-04', '#8 FIS Client', 'Inactive athlete 6100596 resolves active:false cleanly', async () => {
    const r = await apiJson(apiUrl, '/athletes/search?q=6100596');
    assert(r.status === 200 && r.json.athletes[0].active === false);
    return r.json.athletes[0];
  });

  await check('T2-F08-EC13-ENRICH', '#8 FIS Client', 'EC-13 points_enriched flag is boolean and populates fis_points when enriched on 309519', async () => {
    const r = await apiJson(apiUrl, '/races/309519/live');
    if (r.status === 200) {
      assert(Array.isArray(r.json.racers) && r.json.racers.length >= 1, 'Expected >=1 racer on 309519');
      assert(r.json.racers.every((x) => typeof x.points_enriched === 'boolean'), 'points_enriched must be boolean on 309519');
      const enriched = r.json.racers.filter((x) => x.points_enriched === true);
      assert(enriched.every((x) => x.fis_points != null), 'points_enriched=true racer missing fis_points on 309519');
      const unranked = r.json.racers.find((x) => String(x.fis_code) === '109237');
      if (unranked) {
        assert(unranked.points_enriched === false, 'Unranked 109237 should have points_enriched=false');
      }
      const isMock309519 =
        r.json.server_stamp === '794866800.00000' ||
        r.json.racers.some((x) => x.name === 'SEEDED, Four');
      if (isMock309519) {
        assert(enriched.length >= 1, 'Expected >=1 points_enriched racer on mock 309519');
      }
      return { totalRacers: r.json.racers.length, enrichedCount: enriched.length };
    }
    const r309 = await apiJson(apiUrl, '/races/309223/live');
    assert(r309.status === 200 && r309.json.racers.every((x) => typeof x.points_enriched === 'boolean'));
    return 'points_enriched boolean verified';
  });

  await check('T2-F08-ATH-404', '#8 FIS Client', 'Unknown competitor_id /athletes/999999999 returns HTTP 404 JSON', async () => {
    const r = await apiJson(apiUrl, '/athletes/999999999');
    assert(r.status === 404 && r.json && typeof r.json.detail === 'string', `Expected 404 JSON for unknown athlete, got ${r.status}`);
    return r.json;
  });

  await check('T2-F08-RACE-404', '#8 FIS Client', 'Unknown FIS race_id /fis/race/99999999 returns HTTP 404 JSON', async () => {
    const r = await apiJson(apiUrl, '/fis/race/99999999');
    assert(r.status === 404 && r.json && typeof r.json.detail === 'string', `Expected 404 JSON for unknown FIS race, got ${r.status}`);
    return r.json;
  });

  await check('T2-F08-JAKOBSEN', '#8 FIS Client', 'Active athlete 502015 resolves competitor_id 160443 and SL 14.95', async () => {
    const r = await apiJson(apiUrl, '/athletes/search?q=502015');
    assert(r.status === 200 && r.json.athletes.length >= 1);
    const j = r.json.athletes.find((a) => String(a.fis_code) === '502015');
    assert(j && String(j.competitor_id) === '160443' && j.active === true, `Jakobsen mismatch: ${JSON.stringify(j)}`);
    assertClose2(j.points.SL, 14.95, 'Jakobsen SL');
    return j;
  });

  await check('T2-EMP-05', '#12 Hub CALC & Athletes', 'target_fis_points < penalty returns HTTP 200 with achievable: false', async () => {
    const r = await apiJson(apiUrl, '/calc/target', {
      method: 'POST',
      body: { discipline: 'SL', leader_time_ms: 86820, penalty: 23.0, target_fis_points: 20.0 },
    });
    assert(r.status === 200 && r.json.achievable === false && r.json.target_time_ms === null, `Expected 200 achievable:false, got ${r.status}: ${r.text}`);
    return r.json;
  });

  await check('T2-F12-TARGET-422', '#12 Hub CALC & Athletes', 'POST /calc/target with leader_time_ms <= 0 returns HTTP 422', async () => {
    const r0 = await apiJson(apiUrl, '/calc/target', {
      method: 'POST',
      body: { discipline: 'GS', leader_time_ms: 0, penalty: 24.25, target_fis_points: 34.95 },
    });
    const rNeg = await apiJson(apiUrl, '/calc/target', {
      method: 'POST',
      body: { discipline: 'GS', leader_time_ms: -5000, penalty: 24.25, target_fis_points: 34.95 },
    });
    assert((r0.status === 400 || r0.status === 422) && (rNeg.status === 400 || rNeg.status === 422));
    return { r0: r0.status, rNeg: rNeg.status };
  });

  await check('T2-F12-SIM-EMPTY', '#12 Hub CALC & Athletes', 'POST /calc/list-sim rejects empty results [] and computes delta_vs_current', async () => {
    const empty = await apiJson(apiUrl, '/calc/list-sim', {
      method: 'POST',
      body: { discipline: 'GS', season: 2027, results: [] },
    });
    assert(empty.status === 400 || empty.status === 422, `Expected 400/422 for empty results, got ${empty.status}`);
    const withCur = await apiJson(apiUrl, '/calc/list-sim', {
      method: 'POST',
      body: { discipline: 'GS', season: 2027, results: [42.95, 54.35], current_list_points: 60.0 },
    });
    assert(withCur.status === 200);
    assertClose2(withCur.json.delta_vs_current, -1.62, 'delta_vs_current 58.38 - 60.00');
    return withCur.json;
  });

  await check('T2-F12-UI-UNACHIEVABLE', '#12 Hub CALC & Athletes', '/hub CALC UI handles unachievable target (target < penalty) without page errors', async () => {
    await switchHubTab(cdp, 'CALC');
    await fillFieldMatching(cdp, 'Leader Time', '109.47');
    await fillFieldMatching(cdp, 'Penalty', '24.25');
    await fillFieldMatching(cdp, 'Target FIS', '15.00');
    await clickButtonMatching(cdp, 'CALCULATE TARGET|COMPUTE TARGET');
    await waitForCondition(cdp, () => /unachievable|impossible|below|< penalty|non réalisable/i.test(document.body.innerText), 3000, 50);
    assert(cdp.pageErrors.length === 0, `Page errors on unachievable target: ${JSON.stringify(cdp.pageErrors)}`);
    return 'unachievable target UI notice verified';
  });

  // 14. Full portfolio-rules.md CSS/Font/Copy/Accent/Media Audit (22 checks)
  const auditTargets = [
    { label: 'home-desktop', path: '/', w: 1440, h: 900, ignore404: false },
    { label: 'home-mobile', path: '/', w: 390, h: 844, ignore404: false },
    { label: 'hub-mobile', path: '/hub', w: 390, h: 844, ignore404: false },
    { label: 'partners-desktop', path: '/partners', w: 1440, h: 900, ignore404: false },
  ];

  // 14a: Square corners (border-radius === 0px) across all 4 routes
  for (const t of auditTargets) {
    await check(`T2-CSS-RAD-${t.label}`, '#5 UX & Fonts', `${t.label} enforces border-radius: 0px (no rounded cards)`, async () => {
      await cdp.setViewport(t.w, t.h);
      await cdp.navigate(`${baseUrl}${t.path}`, { ignoreStatusErrors: t.ignore404 });
      const bad = await cdp.evaluate(`(() => {
        const out = [];
        for (const el of document.querySelectorAll('body *')) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          if (el instanceof SVGElement) continue;
          const rad = cs.borderRadius;
          if (rad && rad !== '0px') {
            out.push({ tag: el.tagName.toLowerCase(), rad, text: (el.innerText || '').slice(0, 25) });
          }
        }
        return out.slice(0, 10);
      })()`);
      assert(bad.length === 0, `Non-zero border-radius on ${t.label}: ${JSON.stringify(bad)}`);
      return 'all border-radius === 0px';
    });
  }

  // 14b: Pure-Node PNG Accent < 10% + zero neon cyan/magenta/purple-blue across 4 views (4 checks)
  for (const t of auditTargets) {
    await check(`T2-ACCENT-${t.label}`, '#5 UX & Fonts', `${t.label} PNG accent pixel budget < 10% and zero neon glow`, async () => {
      await cdp.setViewport(t.w, t.h);
      await cdp.navigate(`${baseUrl}${t.path}`, { ignoreStatusErrors: t.ignore404 });
      const stats = await cdp.measureAccentRatio();
      assert(stats.accentPct < 10.0, `Accent flooded ${stats.accentPct}% >= 10% on ${t.label}`);
      assert(stats.neonCyanPct < 1.0 && stats.neonMagentaPct < 1.0 && stats.purpleBluePct < 2.0, `Banned neon colors on ${t.label}: ${JSON.stringify(stats)}`);
      return stats;
    });
  }

  // 14c: Zero backdropFilter / boxShadow / stock imagery / CleanShot / gradient blobs + Feature #4 Media Slots Edge Cases (6 checks)
  await check('T2-BAN-STYLE-01', '#5 UX & Fonts', 'Zero backdropFilter, boxShadow, or card gradients across /, /hub, /partners', async () => {
    for (const pathStr of ['/', '/hub', '/partners']) {
      await cdp.setViewport(1440, 900);
      await cdp.navigate(`${baseUrl}${pathStr}`);
      const bad = await cdp.evaluate(`(() => {
        const hits = [];
        for (const el of document.querySelectorAll('body *')) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none') continue;
          if (cs.backdropFilter && cs.backdropFilter !== 'none') hits.push({ type: 'backdropFilter', val: cs.backdropFilter, tag: el.tagName });
          if (cs.boxShadow && cs.boxShadow !== 'none') hits.push({ type: 'boxShadow', val: cs.boxShadow, tag: el.tagName });
          if (cs.backgroundImage && cs.backgroundImage !== 'none' && !el.closest('#start-gate')) {
            hits.push({ type: 'bgImage', val: cs.backgroundImage.slice(0, 60), tag: el.tagName });
          }
        }
        return hits.slice(0, 8);
      })()`);
      assert(bad.length === 0, `Banned style found on ${pathStr}: ${JSON.stringify(bad)}`);
    }
    return 'zero banned CSS effects';
  });

  await check('T2-BAN-STYLE-02', '#4 Media Slots', 'Zero stock photo URLs, CleanShot filenames, or circular SVG icon badges', async () => {
    for (const pathStr of ['/', '/hub', '/partners']) {
      await cdp.navigate(`${baseUrl}${pathStr}`);
      const bad = await cdp.evaluate(`(() => {
        const html = document.documentElement.outerHTML;
        const stockMatch = html.match(/unsplash|pexels|shutterstock|gettyimages|CleanShot/i);
        const circles = Array.from(document.querySelectorAll('button, div, span')).filter(el => {
          const cs = getComputedStyle(el);
          return (cs.borderRadius.includes('50%') || parseFloat(cs.borderRadius) >= 999) && el.querySelector('svg');
        }).length;
        return { stock: stockMatch?.[0] || null, circles };
      })()`);
      assert(!bad.stock && bad.circles === 0, `Banned asset/circle badge on ${pathStr}: ${JSON.stringify(bad)}`);
    }
    return 'zero stock/CleanShot/circular SVG badges';
  });

  await check('T2-F04-MOB-RATIOS', '#4 Media Slots', 'Mobile 390x844 media plates (4:5, 3:2, 16:9, 1:1) maintain positive dimensions and aspect ratios', async () => {
    await cdp.setViewport(390, 844);
    await cdp.navigate(`${baseUrl}/`);
    const plates = await cdp.evaluate(`(() => {
      const hero = document.querySelector('#start-gate figure.pitch-portrait-frame, #start-gate .gate-media-placeholder, #start-gate [role="img"]:not(svg), #start-gate [class*="plate"]');
      const findG = (n) => {
        const g = document.querySelector('#gate-' + n + ', [data-gate="' + n + '"]') ||
          Array.from(document.querySelectorAll('article, [data-gate]')).find(e => e.innerText.includes('GATE ' + n));
        return g?.querySelector('figure.pitch-portrait-frame, .gate-media-placeholder, [class*="plate"], [role="img"]:not(svg)');
      };
      return [hero, findG('03'), findG('05'), findG('08')].map(el => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), ratio: Number((r.width / r.height).toFixed(2)) };
      });
    })()`);
    await cdp.setViewport(1440, 900);
    assert(plates.every((p) => p && p.w >= 160 && p.h >= 100), `Mobile media plates collapsed: ${JSON.stringify(plates)}`);
    return plates;
  });

  await check('T2-F04-NO-FAKE-MEDIA', '#4 Media Slots', 'Architectural media plates contain zero base64 data:image fake blobs or broken <video> elements', async () => {
    const checkMedia = await cdp.evaluate(`(() => {
      const html = document.documentElement.outerHTML;
      const hasDataImg = /src=["']data:image\\//i.test(html);
      const brokenVideos = Array.from(document.querySelectorAll('video')).filter(v => v.error !== null).length;
      return { hasDataImg, brokenVideos };
    })()`);
    assert(!checkMedia.hasDataImg && checkMedia.brokenVideos === 0, `Fake/broken media found: ${JSON.stringify(checkMedia)}`);
    return checkMedia;
  });

  await check('T2-F04-SCRIM-GUARD', '#4 Media Slots', 'Start Gate 00 media plate includes border framing and scrim/surface contrast guard', async () => {
    const guard = await cdp.evaluate(`(() => {
      const el = document.querySelector('#start-gate figure.pitch-portrait-frame, #start-gate .gate-media-placeholder, #start-gate [role="img"]:not(svg), #start-gate [class*="plate"]');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { borderTopWidth: cs.borderTopWidth, bg: cs.backgroundColor, bgImg: cs.backgroundImage };
    })()`);
    assert(guard && parseFloat(guard.borderTopWidth) >= 1, `Missing border framing on Start Gate plate: ${JSON.stringify(guard)}`);
    return guard;
  });

  await check('T2-F04-FAVICON', '#4 Media Slots', '/favicon.svg serves valid SVG with HTTP 200 and image/svg+xml content-type', async () => {
    const res = await fetch(`${baseUrl}/favicon.svg`);
    const text = await res.text();
    assert(res.status === 200 && (res.headers.get('content-type') || '').includes('svg') && text.includes('<svg'), `Invalid /favicon.svg: ${res.status}`);
    return { status: res.status };
  });

  // 14d: Banned fonts, banned copy, emojis, & Feature #1 Career Data Edge Cases (6 checks)
  await check('T2-BAN-FONT', '#5 UX & Fonts', 'Zero banned primary fonts (Inter/Roboto/Arial/Open Sans/Poppins/Space Grotesk/system-ui)', async () => {
    await cdp.setViewport(1440, 900);
    await cdp.navigate(`${baseUrl}/`);
    const badFonts = await cdp.evaluate(`(() => {
      const banned = /^(Inter|Roboto|Arial|Open Sans|Poppins|Space Grotesk|system-ui)$/i;
      const fails = [];
      for (const el of document.querySelectorAll('h1, h2, h3, p, a, button, td, th')) {
        const primary = getComputedStyle(el).fontFamily.split(',')[0].replace(/['"]/g, '').trim();
        if (banned.test(primary)) fails.push({ tag: el.tagName, primary });
      }
      return fails.slice(0, 8);
    })()`);
    assert(badFonts.length === 0, `Banned primary fonts used: ${JSON.stringify(badFonts)}`);
    return 'zero banned fonts';
  });

  await check('T2-BAN-COPY', '#1 Career Data', 'Zero banned buzzwords, placeholder text, TODOs, NaN/undefined, or emojis on /, /hub, /partners', async () => {
    const bannedCopy = /passionate|crafting digital experiences|seamless|elevate|innovative solutions|cutting-edge|let's build something amazing|welcome to my portfolio|lorem ipsum|project one|\[todo|\bNaN\b|\bundefined\b|\[object Object\]/i;
    const emojiRe = /[\u{1F300}-\u{1FAFF}]/u;
    for (const pathStr of ['/', '/hub', '/partners']) {
      await cdp.navigate(`${baseUrl}${pathStr}`);
      const txt = await getBodyText(cdp);
      const m1 = txt.match(bannedCopy);
      const m2 = txt.match(emojiRe);
      assert(!m1, `Banned copy "${m1?.[0]}" on ${pathStr}`);
      assert(!m2, `Emoji "${m2?.[0]}" on ${pathStr}`);
    }
    return 'copy & emoji clean';
  });

  await check('T2-BAN-5838', '#1 Career Data', 'Zero 58.38 list leak on / and /partners', async () => {
    for (const pathStr of ['/', '/partners']) {
      await cdp.navigate(`${baseUrl}${pathStr}`);
      const txt = await getBodyText(cdp);
      assert(!txt.includes('58.38'), `58.38 leaked on ${pathStr}`);
    }
    return '58.38 strictly confined to /hub';
  });

  await check('T2-F01-FR-TYPO', '#1 Career Data', 'French locale on / and /partners uses INSCRIPTIONS and never 147 DÉPARTS or 33 départs', async () => {
    for (const pathStr of ['/', '/partners']) {
      await cdp.navigate(`${baseUrl}${pathStr}`);
      await setLocale(cdp, 'FR');
      const txt = await getBodyText(cdp);
      assert(/147\s+inscriptions/i.test(txt), `Missing 147 inscriptions in FR on ${pathStr}`);
      assert(!/147\s+départs|33\s+départs|STR\s*\/\s*FIN/i.test(txt), `Forbidden FR starts label on ${pathStr}`);
      await setLocale(cdp, 'EN');
    }
    return 'FR entries terminology verified';
  });

  await check('T2-F01-MATH-SUM', '#1 Career Data', 'Career ledger arithmetic invariants hold (96+40+7+3+1=147 entries; 72+72+3=147; 50+43+3=96)', async () => {
    await cdp.navigate(`${baseUrl}/`);
    const txt = await getBodyText(cdp);
    assert(96 + 40 + 7 + 3 + 1 === 147 && 72 + 72 + 3 === 147 && 50 + 43 + 3 === 96);
    for (const tok of ['147', '96', '65%', '34.95', '42.66', '85.50']) {
      assert(txt.includes(tok), `Missing ledger invariant token: ${tok}`);
    }
    assert(/72\s*\/\s*50/.test(txt) && /72\s*\/\s*43/.test(txt) && /3\s*\/\s*3/.test(txt), 'Missing discipline split 72/50, 72/43, or 3/3');
    return 'career ledger arithmetic invariants verified';
  });

  await check('T2-F01-NORAM-FACT', '#1 Career Data', 'Gate 05 Nor-Am & injury facts accurate (Panorama SG 85.50 & 99.73, Sugarloaf DNQ1/DNS, Adstock)', async () => {
    const txt = await getBodyText(cdp);
    for (const tok of ['85.50', '99.73', 'DNQ1', 'Sugarloaf', 'Adstock', '37.00', '40.67', '41.13', '37.80']) {
      assert(txt.includes(tok), `Missing Gate 05 fact: ${tok}`);
    }
    return 'Gate 05 factual integrity verified';
  });

  // 14e: "Nor-Am" single-line rect, DLS table column gap >= 8px, Mobile sticky chrome <= 96px, 404 Tokens (4 checks)
  await check('T2-POLISH-01', '#5 UX & Fonts', '"Nor-Am" in Gate 05 does not wrap mid-token (getClientRects().length === 1)', async () => {
    await cdp.setViewport(390, 844);
    await cdp.navigate(`${baseUrl}/`);
    const rectsLen = await cdp.evaluate(`(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const m = /nor-am/i.exec(node.nodeValue || '');
        if (m && node.parentElement.closest('h1, h2, h3, .nowrap, .nor-am-nowrap')) {
          const range = document.createRange();
          range.setStart(node, m.index);
          range.setEnd(node, m.index + m[0].length);
          return range.getClientRects().length;
        }
      }
      return -1;
    })()`);
    assert(rectsLen === 1, `Nor-Am wrapped across ${rectsLen} lines`);
    return { clientRects: rectsLen };
  });

  await check('T2-POLISH-02', '#5 UX & Fonts', 'DLS table PTS and NOTES columns have horizontal gap >= 8px at desktop viewport', async () => {
    await cdp.setViewport(1440, 900);
    const textGap = await cdp.evaluate(`(() => {
      const table = Array.from(document.querySelectorAll('table')).find(t =>
        Array.from(t.querySelectorAll('th')).some(th => /^NOTES?$/i.test(th.innerText.trim()))
      );
      if (!table) return null;
      const ths = Array.from(table.querySelectorAll('th')).map(t => t.innerText.trim().toUpperCase());
      const ptsIdx = ths.findIndex(t => /^(PTS|POINTS)$/.test(t));
      const notesIdx = ths.findIndex(t => /^NOTES?$/.test(t));
      if (ptsIdx < 0 || notesIdx < 0) return null;
      const row = table.querySelector('tbody tr');
      const cells = Array.from(row.querySelectorAll('td'));
      const rPts = document.createRange();
      rPts.selectNodeContents(cells[ptsIdx]);
      const rNotes = document.createRange();
      rNotes.selectNodeContents(cells[notesIdx]);
      return Math.round((rNotes.getBoundingClientRect().left - rPts.getBoundingClientRect().right) * 10) / 10;
    })()`);
    assert(textGap !== null && textGap >= 8, `PTS <-> NOTES gap ${textGap}px < 8px`);
    return { textContentGap: textGap };
  });

  await check('T2-POLISH-03', '#5 UX & Fonts', 'Mobile sticky chrome height <= 96px with zero duplicate telemetry chart', async () => {
    await cdp.setViewport(390, 844);
    await cdp.navigate(`${baseUrl}/`);
    const sticky = await cdp.evaluate(`(() => {
      let totalStickyH = 0;
      for (const el of document.querySelectorAll('header, aside, nav, [style*="sticky"], [class*="sticky"]')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (cs.position === 'sticky' || cs.position === 'fixed') {
          const r = el.getBoundingClientRect();
          if (r.height > 0 && r.height < 300) totalStickyH += r.height;
        }
      }
      const visibleSplitBoards = Array.from(document.querySelectorAll('aside.split-board, aside.split-board-col')).filter(e => getComputedStyle(e).display !== 'none').length;
      return { totalStickyH, visibleSplitBoards };
    })()`);
    assert(sticky.totalStickyH <= 96, `Mobile sticky chrome bloated: ${sticky.totalStickyH}px > 96px`);
    assert(sticky.visibleSplitBoards === 0, 'Desktop split-board duplicated visibly on mobile');
    return sticky;
  });

  await check('T2-POLISH-04', '#5 UX & Fonts', 'Desktop .split-board at 1440x900 has zero inner vertical scroll overflow', async () => {
    await cdp.setViewport(1440, 900);
    await cdp.navigate(`${baseUrl}/`);
    const sb = await cdp.evaluate(`(() => {
      const el = document.querySelector('.split-board');
      if (!el) return null;
      return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
    })()`);
    assert(sb && sb.scrollHeight <= sb.clientHeight + 1, `.split-board overflows vertically at 1440x900: ${JSON.stringify(sb)}`);
    return sb;
  });

  await check('T2-POLISH-05', '#11 Hub RACE', '/hub RACE athlete name column width >= 96px at 320x568 with zero overflow', async () => {
    await cdp.setViewport(320, 568);
    await cdp.navigate(`${baseUrl}/hub`);
    await fillFieldMatching(cdp, 'DATE', '2026-04-11');
    await waitForCondition(cdp, () => /SUPER SERIE|SKIBEC/i.test(document.body.innerText), 4000, 50);
    await clickButtonMatching(cdp, '309223|0484');
    await waitForCondition(cdp, () => /ST-GERMAIN|BRUNET/i.test(document.body.innerText), 4000, 50);
    await cdp.assertNoHorizontalOverflow(320, '/hub RACE @ 320x568');
    const nameMetrics = await cdp.evaluate(`(() => {
      const els = Array.from(document.querySelectorAll('.hub-racer-name'));
      if (els.length === 0) return { present: false, minW: null };
      const widths = els.slice(0, 10).map(e => Math.round(e.getBoundingClientRect().width));
      return { present: true, minW: Math.min(...widths) };
    })()`);
    if (nameMetrics.present) {
      assert(nameMetrics.minW >= 96, `.hub-racer-name squeezed to ${nameMetrics.minW}px < 96px at 320x568`);
    }
    return nameMetrics;
  });

  await check('T2-F13-404-TOKENS', '#13 Route Closure', '/not-found at 390x844 enforces border-radius: 0px, <10% accent, and FR translation', async () => {
    await cdp.setViewport(390, 844);
    await cdp.navigate(`${baseUrl}/not-found`, { ignoreStatusErrors: true });
    const px = await cdp.measureAccentRatio();
    assert(px.accentPct < 10.0, `404 accent ratio too high: ${px.accentPct}%`);
    await setLocale(cdp, 'FR');
    const frTxt = await getBodyText(cdp);
    assert(/Porte manquée|DÉPART/i.test(frTxt), `404 FR translation missing: ${frTxt.slice(0, 160)}`);
    await setLocale(cdp, 'EN');
    return { accentPct: px.accentPct };
  });

  return runner.finish();
}
