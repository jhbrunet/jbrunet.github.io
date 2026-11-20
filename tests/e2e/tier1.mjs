import {
  apiJson,
  assert,
  assertClose2,
  buildSyntheticLiveRaceRoutes,
  clickButtonMatching,
  createTierRunner,
  fillFieldMatching,
  getBodyText,
  loadExpectedVectors,
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

export async function runTier1(ctx) {
  const { cdp, baseUrl, apiUrl, filterRegex } = ctx;
  const vectors = loadExpectedVectors();
  const runner = createTierRunner('tier1', filterRegex);
  const { check } = runner;

  // Load `/` desktop for Features #1-#5
  await cdp.setViewport(1440, 900);
  await cdp.setReducedMotion(false);
  await cdp.navigate(`${baseUrl}/`);

  // ================= FEATURE #1: Career data & label accuracy fixes =================
  await check('T1-F01-01', '#1 Career Data', 'Entries vs Starts labels accurate (147 ENTRIES, 33 entries, ENT / FIN)', async () => {
    const text = await getBodyText(cdp);
    assert(/\b147\s+ENTRIES\b/i.test(text), 'Missing 147 ENTRIES');
    assert(/\b33\s+entries\b/i.test(text), 'Missing 33 entries');
    assert(/ENT\s*\/\s*FIN/i.test(text), 'Missing ENT / FIN column header');
    for (const forbidden of ['147 STARTS', '33 starts', '147 DÉPARTS', '33 départs', 'STR / FIN']) {
      assert(!text.toUpperCase().includes(forbidden.toUpperCase()), `Forbidden label found: ${forbidden}`);
    }
    return 'verified entries labels';
  });

  await check('T1-F01-02', '#1 Career Data', 'Career totals and discipline splits match master record', async () => {
    const text = await getBodyText(cdp);
    assert(/\b96\b/.test(text) && /65%/.test(text), 'Missing 96 finishes / 65%');
    assert(/\b40\b/.test(text) && /\b7\b/.test(text) && /\b3\b/.test(text) && /\b1\b/.test(text), 'Missing 40/7/3/1 breakdown');
    assert(/6\s+podiums/i.test(text) && /16\s+top[- ]?5/i.test(text) && /33\s+top[- ]?10/i.test(text), 'Missing podium/top5/top10');
    assert(/72\s*\/\s*50/.test(text) && /72\s*\/\s*43/.test(text) && /3\s*\/\s*3/.test(text), 'Missing GS/SL/SG splits');
    return 'totals 147/96/65% verified';
  });

  await check('T1-F01-03', '#1 Career Data', 'Passo Furcia 2023 date and 56.60 race best distinction', async () => {
    const text = await getBodyText(cdp);
    assert(/Passo Furcia/i.test(text) && /42\.66/.test(text), 'Missing Passo Furcia 42.66');
    assert(/(?:Nov[–-]Dec|ITALY)\s*2023/i.test(text), 'Passo Furcia must show 2023');
    assert(/56\.60\s+race\s+best/i.test(text), '56.60 must be labeled race best');
    return '2023 Passo Furcia and 56.60 race best verified';
  });

  await check('T1-F01-04', '#1 Career Data', 'DLS to U18 2-year rank ladder data present (#29->#4->#13->#3->#8->#2->#1)', async () => {
    const text = await getBodyText(cdp);
    for (const tok of ['#29', '#4', '#13', '#3', '#8', '#2', '#1 U18', '2,120']) {
      assert(text.includes(tok), `Missing DLS ladder value: ${tok}`);
    }
    return 'DLS ladder complete';
  });

  await check('T1-F01-05', '#1 Career Data', 'Top-500 #459 anchored to 2024-25 Lists 5-13 and 34.95 PB verified', async () => {
    const text = await getBodyText(cdp);
    assert(/#459/.test(text) && /2024[–-]25/.test(text) && /Lists?\s*5(?:\s*to\s*|[–-])13/i.test(text), 'Missing #459 in 2024–25 Lists 5–13');
    assert(/34\.95/.test(text) && /Mont Sainte-Anne/i.test(text), 'Missing 34.95 Mont Sainte-Anne PB');
    return '#459 and 34.95 verified';
  });

  await check('T1-F01-06', '#1 Career Data', 'Unverified 2026/27 list value 58.38 excluded from /', async () => {
    const text = await getBodyText(cdp);
    assert(!text.includes('58.38'), '58.38 must NOT appear on /');
    return '58.38 excluded on /';
  });

  // ================= FEATURE #2: Contextual Split Telemetry Bay =================
  await check('T1-F02-01', '#2 Split Telemetry', 'Signature 2021-2026 GS points SVG curve present in sticky board', async () => {
    const info = await cdp.evaluate(`(() => {
      const svgs = Array.from(document.querySelectorAll('aside svg, section svg'));
      const sig = svgs.find(s => {
        const r = s.getBoundingClientRect();
        const aria = (s.getAttribute('aria-label') || '') + ' ' + (s.parentElement?.innerText || '');
        return r.width >= 180 && r.height >= 80 && /127\\.09|2021|GS POINTS/i.test(aria);
      });
      if (!sig) return null;
      const r = sig.getBoundingClientRect();
      return { width: r.width, height: r.height, paths: sig.querySelectorAll('path').length, btns: sig.querySelectorAll('[role="button"], button, [tabindex="0"]').length };
    })()`);
    assert(info && info.paths >= 1 && info.btns >= 3, `Signature SVG invalid: ${JSON.stringify(info)}`);
    return info;
  });

  await check('T1-F02-02', '#2 Split Telemetry', 'Gate 01 contextual D3 rank ladder SVG has inverted rank Y-axis', async () => {
    await cdp.evaluate(`(() => {
      const el = document.querySelector('#gate-01, [data-gate="01"]') ||
        Array.from(document.querySelectorAll('article, [data-gate]')).find(e => /GATE 01|2014[–-]2020/i.test(e.innerText));
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - Math.round(window.innerHeight * 0.35), behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    })()`);
    await waitForCondition(
      cdp,
      () => {
        const aside = document.querySelector('aside.split-board-col, aside.split-board, #course-gates aside, aside[aria-label*="Split"]');
        return Boolean(aside && Array.from(aside.querySelectorAll('svg')).filter(s => s.getBoundingClientRect().height >= 70).length >= 2);
      },
      3000,
      50
    );
    const gate1 = await cdp.evaluate(`(() => {
      const aside = document.querySelector('aside.split-board-col, aside.split-board, #course-gates aside, aside[aria-label*="Split"]');
      const svgs = Array.from((aside || document).querySelectorAll('svg')).filter(s => s.getBoundingClientRect().height >= 70);
      const ctxSvg = svgs[svgs.length - 1];
      if (!ctxSvg) return null;
      const circles = Array.from(ctxSvg.querySelectorAll('circle'));
      const rects = Array.from(ctxSvg.querySelectorAll('rect')).filter(r => {
        const w = Number(r.getAttribute('width') || 0);
        const h = Number(r.getAttribute('height') || 0);
        return w > 0 && w <= 24 && h > 0 && h <= 24;
      });
      const markers = circles.length >= 6 ? circles : rects;
      const ys = markers.map(c => Number(c.getAttribute('cy') || c.getAttribute('y') || c.getBoundingClientRect().top));
      return {
        svgCount: svgs.length,
        rect: ctxSvg.getBoundingClientRect(),
        points: markers.length,
        firstY: ys[0],
        lastY: ys[ys.length - 1],
      };
    })()`);
    assert(gate1 && gate1.svgCount >= 2 && gate1.points >= 6, `Gate 01 contextual SVG missing: ${JSON.stringify(gate1)}`);
    assert(gate1.lastY < gate1.firstY, `Rank ladder Y axis not inverted (#1 y=${gate1.lastY} should be < #29 y=${gate1.firstY})`);
    return gate1;
  });

  await check('T1-F02-03', '#2 Split Telemetry', 'Gate 04 contextual D3 3-season avg vs race best chart renders on scroll', async () => {
    await cdp.evaluate(`(() => {
      const el = document.querySelector('#gate-04, [data-gate="04"]') ||
        Array.from(document.querySelectorAll('article, [data-gate]')).find(e => /GATE 04|2022[–-]2024/i.test(e.innerText));
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 120, behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    })()`);
    await waitForCondition(
      cdp,
      () => {
        const aside = document.querySelector('aside.split-board-col, aside.split-board, #course-gates aside, aside[aria-label*="Split"]');
        return Boolean(aside && /83\.5|53\.5|56\.60|36\.12|3-SEASON/i.test(aside.innerText));
      },
      3000,
      50
    );
    const bay = await cdp.evaluate(`(() => {
      const aside = document.querySelector('aside.split-board-col, aside.split-board, #course-gates aside, aside[aria-label*="Split"]');
      if (!aside) return null;
      const svgs = Array.from(aside.querySelectorAll('svg')).filter(s => s.getBoundingClientRect().height >= 70);
      const ctxSvg = svgs[svgs.length - 1];
      return {
        text: aside.innerText,
        paths: ctxSvg ? ctxSvg.querySelectorAll('path').length : 0,
        markers: ctxSvg ? ctxSvg.querySelectorAll('circle, rect').length : 0,
      };
    })()`);
    assert(bay && /83\.5|53\.5|56\.60|36\.12|3-SEASON/i.test(bay.text), `Gate 04 bay did not switch: ${JSON.stringify(bay)}`);
    assert(bay.paths >= 2 && bay.markers >= 6, `Gate 04 chart missing series paths/points: ${JSON.stringify(bay)}`);
    return bay;
  });

  await check('T1-F02-04', '#2 Split Telemetry', 'Gate 07 contextual D3 11-week comeback trace crosses 36.12 threshold', async () => {
    await cdp.evaluate(`(() => {
      const el = document.querySelector('#gate-07, [data-gate="07"]') ||
        Array.from(document.querySelectorAll('article, [data-gate]')).find(e => /GATE 07|Jan[–-]Apr 2026/i.test(e.innerText));
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - Math.round(window.innerHeight * 0.35), behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    })()`);
    await waitForCondition(
      cdp,
      () => {
        const aside = document.querySelector('aside.split-board-col, aside.split-board, #course-gates aside, aside[aria-label*="Split"]');
        return Boolean(aside && /46\.35/.test(aside.innerText) && /34\.95/.test(aside.innerText));
      },
      3000,
      50
    );
    const bay = await cdp.evaluate(`(() => {
      const aside = document.querySelector('aside.split-board-col, aside.split-board, #course-gates aside, aside[aria-label*="Split"]');
      if (!aside) return null;
      const svgs = Array.from(aside.querySelectorAll('svg')).filter(s => s.getBoundingClientRect().height >= 70);
      const ctxSvg = svgs[svgs.length - 1];
      const line = ctxSvg?.querySelector('line.bay-threshold-line, line[stroke-dasharray], line[data-threshold]') ||
        Array.from(ctxSvg?.querySelectorAll('line') || []).find(l => !l.closest('.tick') && !l.classList.contains('bay-grid-line') && l.getAttribute('y1') === l.getAttribute('y2'));
      const threshY = line ? Number(line.getAttribute('y1')) : null;
      const circles = Array.from(ctxSvg?.querySelectorAll('circle') || []);
      const rects = Array.from(ctxSvg?.querySelectorAll('rect') || []).filter(r => {
        const w = Number(r.getAttribute('width') || 0);
        const h = Number(r.getAttribute('height') || 0);
        return w > 0 && w <= 24 && h > 0 && h <= 24;
      });
      const nodes = circles.length >= 2 ? circles : rects;
      const pts = nodes.map(c => ({
        cy: Number(c.getAttribute('cy') || c.getAttribute('y')),
        pts: c.getAttribute('data-pts') || '',
      }));
      return { text: aside.innerText, threshY, pts };
    })()`);
    assert(bay && /46\.35/.test(bay.text) && /34\.95/.test(bay.text) && /36\.12/.test(bay.text), `Gate 07 bay text mismatch`);
    if (bay.threshY !== null && bay.pts.length >= 2) {
      const ys = bay.pts.map((p) => p.cy);
      assert(Math.min(...ys) < bay.threshY && Math.max(...ys) > bay.threshY, `46.35 & 34.95 must bracket threshold y=${bay.threshY}`);
    }
    return bay;
  });

  await check('T1-F02-05', '#2 Split Telemetry', 'Gates 02, 03, 05, 06, 08 switch contextual bay telemetry data', async () => {
    const checks = [
      { gate: 'GATE 02', num: '02', expect: /0\s+starts|COVID/i },
      { gate: 'GATE 03', num: '03', expect: /56\.60|#1\s+U18/i },
      { gate: 'GATE 05', num: '05', expect: /#459|85\.50|37\.00/i },
      { gate: 'GATE 06', num: '06', expect: /9\s+months|284\s+days|0\s+gate/i },
      { gate: 'GATE 08', num: '08', expect: /147|96|8\s+first-year/i },
    ];
    for (const item of checks) {
      await cdp.callFn((gatePat, gateNum) => {
        const el =
          document.querySelector(`#gate-${gateNum}, [data-gate="${gateNum}"]`) ||
          Array.from(document.querySelectorAll('article, [data-gate]')).find((e) => e.innerText.includes(gatePat));
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - Math.round(window.innerHeight * 0.35), behavior: 'instant' });
        window.dispatchEvent(new Event('scroll'));
      }, item.gate, item.num);
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
        item.expect.source,
        item.num
      ).catch(() => {});
      const bayText = await cdp.evaluate(`(document.querySelector('#contextual-bay, .telemetry-bay, .split-board-bay-desktop') || document.querySelector('aside.split-board-col, aside.split-board, #course-gates aside'))?.innerText || ''`);
      assert(item.expect.test(bayText), `Gate ${item.gate} telemetry bay did not match ${item.expect}: ${bayText.slice(0, 120)}`);
    }
    return 'all 5 structured telemetry gates updated';
  });

  await check('T1-F02-06', '#2 Split Telemetry', 'Mobile 390x844 renders inline D3 charts inside Gate 01 and Gate 07', async () => {
    await cdp.setViewport(390, 844);
    const res = await cdp.evaluate(`(() => {
      const g1 = document.querySelector('#gate-01, [data-gate="01"]') ||
        Array.from(document.querySelectorAll('article, [data-gate]')).find(e => /GATE 01/i.test(e.innerText));
      const g7 = document.querySelector('#gate-07, [data-gate="07"]') ||
        Array.from(document.querySelectorAll('article, [data-gate]')).find(e => /GATE 07/i.test(e.innerText));
      const s1 = g1?.querySelector('svg');
      const s7 = g7?.querySelector('svg');
      const r1 = s1?.getBoundingClientRect();
      const r7 = s7?.getBoundingClientRect();
      return {
        g1: r1 ? { w: r1.width, h: r1.height } : null,
        g7: r7 ? { w: r7.width, h: r7.height } : null,
      };
    })()`);
    await cdp.setViewport(1440, 900);
    assert(res.g1 && res.g1.w >= 180 && res.g1.h >= 80, `Mobile Gate 01 inline SVG missing: ${JSON.stringify(res)}`);
    assert(res.g7 && res.g7.w >= 180 && res.g7.h >= 80, `Mobile Gate 07 inline SVG missing: ${JSON.stringify(res)}`);
    return res;
  });

  // ================= FEATURE #3: Ski Course Gates Flow =================
  await check('T1-F03-01', '#3 Ski Course Gates', 'Inter-gate course connector SVGs exist across gates 00->08', async () => {
    const count = await cdp.evaluate(`(() => {
      return Array.from(document.querySelectorAll('svg')).filter(s => {
        if (s.closest('aside')) return false;
        const aria = (s.getAttribute('aria-label') || '') + ' ' + (s.getAttribute('class') || '');
        if (/Rank Progression|Comeback|Season/i.test(aria)) return false;
        const r = s.getBoundingClientRect();
        return r.width > 120 && r.height >= 35 && s.querySelector('path');
      }).length;
    })()`);
    assert(count >= 7, `Expected >= 7 inter-gate connectors, got ${count}`);
    return { connectorCount: count };
  });

  await check('T1-F03-02', '#3 Ski Course Gates', 'Turning gate markers alternate left and right across odd/even connectors', async () => {
    const xs = await cdp.evaluate(`(() => {
      const svgs = Array.from(document.querySelectorAll('svg')).filter(s => {
        if (s.closest('aside')) return false;
        const aria = (s.getAttribute('aria-label') || '') + ' ' + (s.getAttribute('class') || '');
        if (/Rank Progression|Comeback|Season/i.test(aria)) return false;
        const r = s.getBoundingClientRect();
        return r.width > 120 && r.height >= 35 && s.querySelector('path');
      });
      return svgs.map(s => {
        const sr = s.getBoundingClientRect();
        let marker = s.querySelector('circle') || s.querySelector('rect');
        if (!marker && s.parentElement) {
          marker = Array.from(s.parentElement.querySelectorAll('span, div')).find(el => {
            const mr = el.getBoundingClientRect();
            return mr.width > 0 && mr.width < sr.width * 0.45 && mr.height > 0;
          });
        }
        if (!marker) return null;
        const mr = marker.getBoundingClientRect();
        return Number((((mr.left + mr.width / 2) - sr.left) / sr.width).toFixed(3));
      }).filter(v => v !== null);
    })()`);
    assert(xs.length >= 6, `Too few turning markers: ${xs.length}`);
    let alternations = 0;
    for (let i = 1; i < xs.length; i++) {
      if ((xs[i] > 0.5 && xs[i - 1] < 0.5) || (xs[i] < 0.5 && xs[i - 1] > 0.5)) alternations++;
    }
    assert(alternations >= 4, `Turning gate markers do not alternate sides: ${JSON.stringify(xs)}`);
    return { normalizedMarkerX: xs, alternations };
  });

  await check('T1-F03-03', '#3 Ski Course Gates', 'Carved S-curve paths present in connectors', async () => {
    const curvedCount = await cdp.evaluate(`(() => {
      return Array.from(document.querySelectorAll('svg path')).filter(p => {
        if (p.closest('aside')) return false;
        const d = p.getAttribute('d') || '';
        return /[CQS]/i.test(d);
      }).length;
    })()`);
    assert(curvedCount >= 7, `Expected >= 7 carved S-curve paths, found ${curvedCount}`);
    return { curvedCount };
  });

  await check('T1-F03-04', '#3 Ski Course Gates', 'Pause bypass connectors (COVID & 9-month gap) include dashed strokes', async () => {
    const dashedCount = await cdp.evaluate(`(() => {
      return Array.from(document.querySelectorAll('svg path, svg line')).filter(p => {
        if (p.closest('aside')) return false;
        const da = p.getAttribute('stroke-dasharray') || getComputedStyle(p).strokeDasharray;
        return da && da !== 'none' && /\\d/.test(da);
      }).length;
    })()`);
    assert(dashedCount >= 2, `Expected >= 2 dashed pause bypass strokes, got ${dashedCount}`);
    return { dashedCount };
  });

  await check('T1-F03-05', '#3 Ski Course Gates', 'Connector SVGs do not overlap gate headings or paragraph text', async () => {
    const overlaps = await cdp.evaluate(`(() => {
      const conns = Array.from(document.querySelectorAll('svg')).filter(s => {
        if (s.closest('aside')) return false;
        return /connector/i.test(s.getAttribute('class') || '') || (!s.getAttribute('aria-label') && s.getBoundingClientRect().height >= 35 && s.getBoundingClientRect().height <= 120);
      });
      const textEls = Array.from(document.querySelectorAll('main h2, main h3, main p, main table'));
      const hits = [];
      for (const c of conns) {
        const cr = c.getBoundingClientRect();
        for (const t of textEls) {
          const tr = t.getBoundingClientRect();
          const ix = Math.max(0, Math.min(cr.right, tr.right) - Math.max(cr.left, tr.left));
          const iy = Math.max(0, Math.min(cr.bottom, tr.bottom) - Math.max(cr.top, tr.top));
          if (ix * iy > 10) hits.push({ text: (t.innerText || '').slice(0, 30), area: Math.round(ix * iy) });
        }
      }
      return hits;
    })()`);
    assert(overlaps.length === 0, `Connector overlap detected: ${JSON.stringify(overlaps)}`);
    return 'zero overlaps';
  });

  // ================= FEATURE #4: Media Slots & Hero Contrast =================
  await check('T1-F04-01', '#4 Media Slots', 'Hero 4:5 slot maintains exact aspect ratio (0.80 ± 5%)', async () => {
    const ratio = await cdp.evaluate(`(() => {
      const el = document.querySelector('#start-gate figure.pitch-portrait-frame, #start-gate .gate-media-placeholder, #start-gate [role="img"]:not(svg), #start-gate img, #start-gate [class*="plate"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, ratio: r.width / r.height };
    })()`);
    assert(ratio && ratio.h >= 120 && Math.abs(ratio.ratio - 0.8) <= 0.04, `Hero 4:5 aspect mismatch: ${JSON.stringify(ratio)}`);
    return ratio;
  });

  await check('T1-F04-02', '#4 Media Slots', 'Course slots (3:2 Gate 03, 16:9 Gate 05, 1:1 Gate 08) match target ratios', async () => {
    const ratios = await cdp.evaluate(`(() => {
      const findPlate = (gateNum) => {
        const gate = document.querySelector('#gate-' + gateNum + ', [data-gate="' + gateNum + '"]') ||
          Array.from(document.querySelectorAll('article, [data-gate]')).find(e => e.innerText.includes('GATE ' + gateNum));
        const plate = gate?.querySelector('figure.pitch-portrait-frame, .gate-media-placeholder, [class*="plate"], img, [role="img"]:not(svg)');
        if (!plate) return null;
        const r = plate.getBoundingClientRect();
        return { w: r.width, h: r.height, ratio: r.width / r.height };
      };
      return { g03: findPlate('03'), g05: findPlate('05'), g08: findPlate('08') };
    })()`);
    assert(ratios.g03 && Math.abs(ratios.g03.ratio - 1.5) <= 0.08, `Gate 03 3:2 mismatch: ${JSON.stringify(ratios.g03)}`);
    assert(ratios.g05 && Math.abs(ratios.g05.ratio - 16 / 9) <= 0.09, `Gate 05 16:9 mismatch: ${JSON.stringify(ratios.g05)}`);
    assert(ratios.g08 && Math.abs(ratios.g08.ratio - 1.0) <= 0.05, `Gate 08 1:1 mismatch: ${JSON.stringify(ratios.g08)}`);
    return ratios;
  });

  await check('T1-F04-03', '#4 Media Slots', 'Zero broken <img> elements and valid alt text', async () => {
    const imgs = await cdp.evaluate(`(() => {
      return Array.from(document.querySelectorAll('img')).map(img => ({
        src: img.currentSrc || img.src,
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        alt: img.getAttribute('alt'),
      }));
    })()`);
    for (const img of imgs) {
      assert(img.complete && img.naturalWidth > 0, `Broken image: ${JSON.stringify(img)}`);
      assert(typeof img.alt === 'string' && img.alt.trim().length > 0, `Missing alt on ${img.src}`);
    }
    return { imgCount: imgs.length };
  });

  await check('T1-F04-04', '#4 Media Slots', 'Hero h1 and BEST GS 34.95 achieve WCAG luminance separation', async () => {
    const contrast = await cdp.evaluate(`(() => {
      const parseRgb = (s) => {
        const m = s.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
        return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [10, 10, 10];
      };
      const lum = ([r, g, b]) => {
        const fn = (c) => {
          const v = c / 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * fn(r) + 0.7152 * fn(g) + 0.0722 * fn(b);
      };
      const ratio = (c1, c2) => {
        const l1 = lum(c1), l2 = lum(c2);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      const h1 = document.querySelector('h1');
      const bg = parseRgb(getComputedStyle(document.body).backgroundColor);
      const fg = parseRgb(getComputedStyle(h1).color);
      return { ratio: Number(ratio(fg, bg).toFixed(2)) };
    })()`);
    assert(contrast.ratio >= 4.5, `Hero contrast too low: ${contrast.ratio}`);
    return contrast;
  });

  await check('T1-F04-05', '#4 Media Slots', 'Document title, meta description, and favicon load cleanly', async () => {
    const meta = await cdp.evaluate(`(() => ({
      title: document.title,
      desc: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      icon: document.querySelector('link[rel*="icon"]')?.getAttribute('href') || ''
    }))()`);
    assert(meta.title.includes('Julian Brunet') && meta.desc.length > 20, `Missing SEO metadata: ${JSON.stringify(meta)}`);
    assert(meta.icon.length > 0, 'Missing favicon link');
    return meta;
  });

  // ================= FEATURE #5: / UX, A11y & Token Polish =================
  await check('T1-F05-01', '#5 UX & Fonts', 'Libron font loads without errors and renders h1 at oversized display scale', async () => {
    await cdp.scrollToY(0);
    const fInfo = await cdp.evaluate(`(() => {
      const fonts = Array.from(document.fonts).map(f => ({
        family: f.family.replace(/['"]/g, ''),
        status: f.status,
      }));
      const h1 = document.querySelector('h1');
      const cs = getComputedStyle(h1);
      return {
        fonts,
        checkLibron: document.fonts.check('700 16px "Libron"'),
        h1Family: cs.fontFamily,
        h1Size: parseFloat(cs.fontSize),
      };
    })()`);
    assert(fInfo.fonts.some((f) => f.family === 'Libron' && f.status === 'loaded'), `Libron not loaded: ${JSON.stringify(fInfo)}`);
    assert(!fInfo.fonts.some((f) => f.status === 'error'), `Font failed to load: ${JSON.stringify(fInfo.fonts)}`);
    assert(fInfo.checkLibron === true, 'document.fonts.check("Libron") returned false');
    assert(/Libron/i.test(fInfo.h1Family) && fInfo.h1Size >= 72, `Hero h1 typography invalid: ${JSON.stringify(fInfo)}`);
    return fInfo;
  });

  await check('T1-F05-02', '#5 UX & Fonts', 'IBM Plex Sans & Mono loaded with tabular-nums, zero banned primary fonts', async () => {
    const info = await cdp.evaluate(`(() => {
      const fonts = Array.from(document.fonts).map(f => ({ family: f.family.replace(/['"]/g, ''), status: f.status }));
      const bodyFamily = getComputedStyle(document.body).fontFamily;
      const monoEl = document.querySelector('nav a, .mono, table');
      const monoCs = monoEl ? getComputedStyle(monoEl) : null;
      return {
        fonts,
        bodyFamily,
        monoFamily: monoCs?.fontFamily || '',
        fontVariantNumeric: monoCs?.fontVariantNumeric || '',
      };
    })()`);
    assert(/IBM Plex Sans/i.test(info.bodyFamily), `Body font mismatch: ${info.bodyFamily}`);
    assert(/IBM Plex Mono/i.test(info.monoFamily), `Mono font mismatch: ${info.monoFamily}`);
    assert(!/^(Inter|Roboto|Arial|Open Sans|Poppins|Space Grotesk|system-ui)\b/i.test(info.bodyFamily.replace(/['"]/g, '').trim()), `Banned primary font: ${info.bodyFamily}`);
    return info;
  });

  await check('T1-F05-03', '#5 UX & Fonts', 'Bib block, BEST GS 34.95, and clickable GATE 01 jump work', async () => {
    await cdp.scrollToY(0);
    const text = await getBodyText(cdp);
    assert(/CAN\s*·\s*FIS\s*6100596/i.test(text), 'Missing CAN · FIS 6100596 bib block');
    assert(/GS\s*\/\s*HEAD COACH U18/i.test(text), 'Missing GS / HEAD COACH U18 role');
    assert(/BEST GS 34\.95/i.test(text), 'Missing BEST GS 34.95');
    await clickButtonMatching(cdp, 'GATE 01');
    await waitForCondition(cdp, () => window.scrollY > 200, 3000, 50);
    const scrollY = await cdp.evaluate('window.scrollY');
    assert(scrollY > 200, `Clicking GATE 01 did not advance scroll (scrollY=${scrollY})`);
    return { scrollY };
  });

  await check('T1-F05-04', '#5 UX & Fonts', 'EN/FR toggle translates / labels and reverts cleanly', async () => {
    await setLocale(cdp, 'FR');
    const frText = await getBodyText(cdp);
    assert(/147\s+INSCRIPTIONS/i.test(frText) && /33\s+inscriptions/i.test(frText), 'FR translation missing INSCRIPTIONS');
    assert(!/\b147\s+DÉPARTS\b/i.test(frText), 'FR must not say 147 DÉPARTS');
    await setLocale(cdp, 'EN');
    const enText = await getBodyText(cdp);
    assert(/\b147\s+ENTRIES\b/i.test(enText), 'Reverting FR -> EN failed');
    return 'EN <-> FR verified';
  });

  await check('T1-F05-05', '#5 UX & Fonts', 'Keyboard Tab + Enter/Space activates SplitCurveD3 nodes and single h1 landmark exists', async () => {
    const a11y = await cdp.evaluate(`(() => {
      const h1s = Array.from(document.querySelectorAll('h1'));
      return {
        h1Count: h1s.length,
        hasMain: Boolean(document.querySelector('main')),
        hasNav: Boolean(document.querySelector('nav')),
        hasSkip: Boolean(document.querySelector('a[href^="#"]')),
      };
    })()`);
    assert(a11y.h1Count === 1 && a11y.hasMain && a11y.hasNav && a11y.hasSkip, `Landmarks failed: ${JSON.stringify(a11y)}`);

    const getReadout = () =>
      cdp.evaluate(
        `(document.querySelector('#curve-readout') || document.querySelector('aside.split-board-col, aside.split-board, #course-gates aside'))?.innerText || ''`
      );
    const before = await getReadout();
    await cdp.evaluate(`(() => {
      const primary = Array.from(document.querySelectorAll('#split-curve-svg [role="button"]'));
      const nodes = primary.length
        ? primary
        : Array.from(document.querySelectorAll('aside.split-board-col svg [role="button"], aside.split-board svg [role="button"], aside svg [tabindex="0"]'));
      if (nodes[0]) nodes[0].focus();
    })()`);
    await cdp.pressKey('Enter');
    const afterEnter = await getReadout();
    await cdp.evaluate(`(() => {
      const primary = Array.from(document.querySelectorAll('#split-curve-svg [role="button"]'));
      const nodes = primary.length
        ? primary
        : Array.from(document.querySelectorAll('aside.split-board-col svg [role="button"], aside.split-board svg [role="button"], aside svg [tabindex="0"]'));
      const last = nodes[nodes.length - 1];
      if (last) last.focus();
    })()`);
    await cdp.pressKey('Space');
    const afterSpace = await getReadout();
    assert(afterEnter !== afterSpace || afterSpace !== before, 'Keyboard Enter/Space on curve nodes did not change readout');
    return { a11y };
  });

  await check('T1-F05-06', '#5 UX & Fonts', 'Mobile drawer opens on tap and dismisses cleanly via Escape', async () => {
    await cdp.setViewport(390, 844);
    await clickButtonMatching(cdp, 'MENU|navigation|drawer');
    const expandedTrue = await cdp.evaluate('document.querySelector("[aria-expanded]")?.getAttribute("aria-expanded")');
    assert(expandedTrue === 'true', `Drawer did not open: aria-expanded=${expandedTrue}`);
    await cdp.pressKey('Escape');
    const expandedFalse = await cdp.evaluate('document.querySelector("[aria-expanded]")?.getAttribute("aria-expanded")');
    await cdp.setViewport(1440, 900);
    assert(expandedFalse === 'false', `Escape did not close drawer: aria-expanded=${expandedFalse}`);
    return 'mobile drawer Escape verified';
  });

  // ================= FEATURE #6: FastAPI + Vercel /api/hub/* Wiring =================
  await check('T1-F06-01', '#6 API Contract', 'GET /api/hub/health returns 200 with list metadata and cache mode', async () => {
    const r = await apiJson(apiUrl, '/health');
    assert(r.status === 200 && r.contentType.includes('application/json'), `Bad health status/type: ${r.status} ${r.contentType}`);
    assert(r.json?.ok === true, 'health.ok !== true');
    assert(r.json?.fis_list?.season === 2027 && r.json?.fis_list?.list_id && r.json?.fis_list?.list_number, `Unexpected fis_list: ${JSON.stringify(r.json)}`);
    assert(typeof r.json?.cache_mode === 'string' && r.json.cache_mode.length > 0, 'Missing cache_mode');
    return r.json;
  });

  await check('T1-F06-02', '#6 API Contract', 'Same-origin browser fetch to /api/hub/health succeeds inside /hub', async () => {
    await cdp.navigate(`${baseUrl}/hub`);
    const res = await cdp.evaluate(`fetch('/api/hub/health').then(async r => ({ status: r.status, body: await r.json() }))`);
    assert(res.status === 200 && res.body?.ok === true, `Same-origin fetch failed: ${JSON.stringify(res)}`);
    return res;
  });

  await check('T1-F06-03', '#6 API Contract', 'Invalid lt_id 99999999 returns structured JSON 404 (not raw 500)', async () => {
    const r = await apiJson(apiUrl, '/races/99999999/live');
    assert(r.status === 404 && r.json && typeof r.json.detail === 'string', `Expected 404 JSON, got ${r.status}: ${r.text}`);
    return r.json;
  });

  await check('T1-F06-04', '#6 API Contract', 'Malformed query/body returns structured 400/422 JSON', async () => {
    const badDate = await apiJson(apiUrl, '/races?date=2026-99-99');
    assert(badDate.status === 400 || badDate.status === 422, `Expected 400/422 for bad date, got ${badDate.status}`);
    const badTarget = await apiJson(apiUrl, '/calc/target', {
      method: 'POST',
      body: { discipline: 'GS', leader_time_ms: 0, penalty: 24.25, target_fis_points: 34.95 },
    });
    assert(badTarget.status === 400 || badTarget.status === 422, `Expected 400/422 for 0 leader time, got ${badTarget.status}`);
    return { badDateStatus: badDate.status, badTargetStatus: badTarget.status };
  });

  await check('T1-F06-05', '#6 API Contract', '/hub triggers valid /api/hub/* calls with zero console/page errors', async () => {
    const nav = await cdp.navigate(`${baseUrl}/hub`);
    await waitForCondition(
      cdp,
      async () => cdp.networkResponses.some((r) => r.url.includes('/api/hub/')),
      4000,
      50
    );
    const hubApis = cdp.networkResponses.filter((r) => r.url.includes('/api/hub/'));
    assert(nav.documentStatus === 200, `/hub status=${nav.documentStatus}`);
    assert(hubApis.length >= 1 && hubApis.every((r) => r.status < 400), `Hub API error: ${JSON.stringify(hubApis)}`);
    assert(cdp.pageErrors.length === 0, `Page errors on /hub: ${JSON.stringify(cdp.pageErrors)}`);
    return { apiCalls: hubApis.length };
  });

  // ================= FEATURE #7: live-timing.com ISO-8859-1 Parser =================
  await check('T1-F07-01', '#7 Live-Timing Parser', 'GET /api/hub/races?date=2026-04-11 returns MSA 309223 and codex 0484', async () => {
    const r = await apiJson(apiUrl, '/races?date=2026-04-11');
    assert(r.status === 200 && Array.isArray(r.json?.races), 'Invalid /races response');
    const msa = r.json.races.find((x) => String(x.lt_id) === '309223');
    assert(msa, '309223 missing from 2026-04-11 races');
    assert(String(msa.fis_codex).replace(/^0+/, '') === '484', `Expected codex 484/0484, got ${msa.fis_codex}`);
    return msa;
  });

  await check('T1-F07-02', '#7 Live-Timing Parser', 'GET /api/hub/races/309223/live returns Julian 6100596 ms timings accurately', async () => {
    const r = await apiJson(apiUrl, '/races/309223/live?season=2026&category=FIS');
    assert(r.status === 200, `Status=${r.status}`);
    assert(r.json.leader_time_ms === 109470, `leader_time_ms=${r.json.leader_time_ms}`);
    const julian = r.json.racers.find((x) => String(x.fis_code) === '6100596' || /BRUNET/i.test(x.name));
    assert(julian && julian.rank === 12 && julian.r1_ms === 56960 && julian.r2_ms === 53670 && julian.total_ms === 110630, `Julian mismatch: ${JSON.stringify(julian)}`);
    return julian;
  });

  await check('T1-F07-03', '#7 Live-Timing Parser', 'ISO-8859-1 & &#201; French accents decode cleanly with zero mojibake', async () => {
    const r = await apiJson(apiUrl, '/races/990001/live?season=2027&category=FIS');
    if (r.status === 404) {
      const rJan = await apiJson(apiUrl, '/races?date=2026-01-17');
      assert(rJan.status === 200 && !rJan.text.includes('\ufffd') && !rJan.text.includes('Ã©'), 'Mojibake in 2026-01-17 races');
      return { verifiedOn: '2026-01-17', count: rJan.json.count };
    }
    assert(r.status === 200, `Unexpected status ${r.status}`);
    assert(!r.text.includes('\ufffd') && !r.text.includes('Ã'), `Mojibake detected: ${r.text.slice(0, 200)}`);
    assert(r.text.includes('É') || r.text.includes('é'), 'Missing expected French accents');
    return { verifiedOn: '990001' };
  });

  await check('T1-F07-04', '#7 Live-Timing Parser', '1-run DH 300126 keeps r2=DNS finishers as QLF and preserves i11 cs unit ratio', async () => {
    const r = await apiJson(apiUrl, '/races/300126/live');
    assert(r.status === 200, `300126 status=${r.status}`);
    const wall = r.json.racers.find((x) => /WALL,\s*Kenzie/i.test(x.name));
    assert(wall && (wall.status === 'QLF' || wall.status === 'FIN') && wall.total_ms === 82110, `1-run DH finisher dropped: ${JSON.stringify(wall)}`);
    const i11 = wall.intermediates_cs?.i11;
    assert(i11 === 615, `Expected i11=615 cs, got ${i11}`);
    return wall;
  });

  await check('T1-F07-05', '#7 Live-Timing Parser', 'Status mapping preserves QLF/DNF1/DNF2/DNS1/DNS2/DQ', async () => {
    const r = await apiJson(apiUrl, '/races/309223/live?season=2026');
    assert(r.status === 200);
    const statuses = new Set(r.json.racers.map((x) => x.status));
    assert((statuses.has('QLF') || statuses.has('FIN')) && statuses.has('DNS1') && statuses.has('DNF2'), `Missing expected statuses: ${[...statuses]}`);
    return [...statuses];
  });

  // ================= FEATURE #8: fis-ski.com & ALFP2027F.zip Client =================
  await check('T1-F08-01', '#8 FIS Client', 'ALFP2027F.zip list reports valid Season 2027 metadata and ISO valid_from', async () => {
    const r = await apiJson(apiUrl, '/health');
    assert(r.status === 200 && r.json.fis_list.season === 2027 && r.json.fis_list.list_id, `fis_list=${JSON.stringify(r.json?.fis_list)}`);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(r.json.fis_list.valid_from), `Invalid valid_from: ${r.json.fis_list.valid_from}`);
    return r.json.fis_list;
  });

  await check('T1-F08-02', '#8 FIS Client', 'athletes/search?q=6100596 falls back to inactive Julian Brunet (256564)', async () => {
    const r = await apiJson(apiUrl, '/athletes/search?q=6100596');
    assert(r.status === 200 && Array.isArray(r.json?.athletes) && r.json.athletes.length >= 1, `Missing 6100596: ${r.text}`);
    const j = r.json.athletes.find((a) => String(a.fis_code) === '6100596');
    assert(j && String(j.competitor_id) === '256564' && j.active === false, `Inactive athlete invalid: ${JSON.stringify(j)}`);
    return j;
  });

  await check('T1-F08-03', '#8 FIS Client', 'athletes/search resolves active athletes by FIS code or name', async () => {
    const r = await apiJson(apiUrl, '/athletes/search?q=502015');
    assert(r.status === 200 && r.json.athletes.length >= 1, 'Active athlete 502015 not found');
    const a = r.json.athletes[0];
    assert(a.active === true && a.points?.SL !== null, `Active athlete invalid: ${JSON.stringify(a)}`);
    return a;
  });

  await check('T1-F08-04', '#8 FIS Client', 'GET /api/hub/athletes/256564 returns points and 2026 comeback results', async () => {
    const r = await apiJson(apiUrl, '/athletes/256564');
    assert(r.status === 200, `Status=${r.status}`);
    assertClose2(r.json.current_points.GS, 58.38, 'GS list pts');
    assertClose2(r.json.current_points.SL, 93.52, 'SL list pts');
    assertClose2(r.json.current_points.SG, 135.54, 'SG list pts');
    assert(JSON.stringify(r.json.recent_results).includes('34.95'), 'Missing 34.95 in recent_results');
    return r.json.current_points;
  });

  await check('T1-F08-05', '#8 FIS Client', 'GET /api/hub/fis/race/130671 returns codex 484 and Julian 34.95 / 2027 42.95', async () => {
    const r = await apiJson(apiUrl, '/fis/race/130671');
    const codex = String(r.json?.codex ?? r.json?.competition_codex ?? '').replace(/^0+/, '');
    assert(r.status === 200 && codex === '484', `Bad 130671: ${r.text}`);
    const j = r.json.results.find((x) => String(x.fis_code) === '6100596' || /BRUNET/i.test(x.name));
    assert(j && Number(j.rank) === 12, `Julian rank mismatch: ${JSON.stringify(j)}`);
    assertClose2(j.fis_points, 34.95, '130671 Julian fis_points');
    if (j.points_2027 !== undefined && j.points_2027 !== null) {
      assertClose2(j.points_2027, 42.95, '130671 Julian points_2027');
    }
    return j;
  });

  // ================= FEATURE #9: Exact 2026/27 Decimal FIS Rules Engine =================
  await check('T1-F09-01', '#9 Decimal Rules', 'MSA 309223 Season 2026 exact penalty 24.25 and Julian 34.95', async () => {
    const r = await apiJson(apiUrl, '/races/309223/live?season=2026&category=FIS');
    assert(r.status === 200);
    assertClose2(r.json.penalty.sum_a, 143.10, 'sum_a');
    assertClose2(r.json.penalty.sum_b, 121.95, 'sum_b');
    assertClose2(r.json.penalty.sum_c, 22.60, 'sum_c');
    assertClose2(r.json.penalty.applied_penalty, 24.25, 'applied_penalty 2026');
    const j = r.json.racers.find((x) => String(x.fis_code) === '6100596');
    assertClose2(j.race_points, 10.70, 'Julian P');
    assertClose2(j.expected_fis_points, 34.95, 'Julian expected 2026');
    return { applied: r.json.penalty.applied_penalty, julian: j.expected_fis_points };
  });

  await check('T1-F09-02', '#9 Decimal Rules', 'MSA 309223 Season 2027 applies +8.00 Adder (32.25 & Julian 42.95)', async () => {
    const r = await apiJson(apiUrl, '/races/309223/live?season=2027&category=FIS');
    assert(r.status === 200);
    assertClose2(r.json.penalty.adder, 8.0, 'adder 2027');
    assertClose2(r.json.penalty.applied_penalty, 32.25, 'applied_penalty 2027');
    const j = r.json.racers.find((x) => String(x.fis_code) === '6100596');
    assertClose2(j.expected_fis_points, 42.95, 'Julian expected 2027');
    return { applied: r.json.penalty.applied_penalty, julian: j.expected_fis_points };
  });

  await check('T1-F09-03', '#9 Decimal Rules', 'POST /calc/penalty verifies 132230 clamped 23.00 and 132229 unclamped 32.42', async () => {
    const r1 = await apiJson(apiUrl, '/calc/penalty', {
      method: 'POST',
      body: {
        discipline: 'SL',
        gender: 'M',
        category: 'FIS',
        season: 2027,
        competitors: buildCompetitorsForSums('SL', 79.37, 74.79, 56.49),
      },
    });
    assert(r1.status === 200);
    const p1 = r1.json.penalty || r1.json;
    assertClose2(p1.raw_calc ?? p1.raw, 9.77, '132230 raw');
    assertClose2(p1.adder, 8.0, '132230 adder');
    assertClose2(p1.applied_penalty ?? p1.applied, 23.0, '132230 clamped');
    assert(p1.clamped === true, '132230 clamped flag');

    const r2 = await apiJson(apiUrl, '/calc/penalty', {
      method: 'POST',
      body: {
        discipline: 'SL',
        gender: 'W',
        category: 'FIS',
        season: 2027,
        competitors: buildCompetitorsForSums('SL', 141.15, 129.90, 26.83),
      },
    });
    assert(r2.status === 200);
    const p2 = r2.json.penalty || r2.json;
    assertClose2(p2.raw_calc ?? p2.raw, 24.42, '132229 raw');
    assertClose2(p2.applied_penalty ?? p2.applied, 32.42, '132229 applied');
    assert(p2.clamped === false, '132229 should not clamp');
    return { c132230: p1.applied_penalty ?? p1.applied, c132229: p2.applied_penalty ?? p2.applied };
  });

  await check('T1-F09-04', '#9 Decimal Rules', 'POST /calc/target exact MSA 309223 inverse math (110.63s & R2 53.67s)', async () => {
    const r = await apiJson(apiUrl, '/calc/target', {
      method: 'POST',
      body: {
        discipline: 'GS',
        leader_time_ms: 109470,
        penalty: 24.25,
        target_fis_points: 34.95,
        run1_ms: 56960,
      },
    });
    assert(r.status === 200 && r.json.achievable === true);
    assertClose2(r.json.target_race_points ?? r.json.p_target, 10.70, 'target_race_points');
    assertClose2(r.json.target_time_seconds ?? r.json.t_target_s, 110.63, 'target_time_seconds');
    assert((r.json.target_time_ms ?? r.json.t_target_ms) === 110630, `target_time_ms=${r.json.target_time_ms}`);
    assert(r.json.run2_needed_ms === 53670, `run2_needed_ms=${r.json.run2_needed_ms}`);
    return r.json;
  });

  await check('T1-F09-05', '#9 Decimal Rules', 'POST /calc/list-sim Season 2027 Best-3 GS (58.38 +20%) & 1-res SL (+44%)', async () => {
    const gs = await apiJson(apiUrl, '/calc/list-sim', {
      method: 'POST',
      body: { discipline: 'GS', season: 2027, results: [42.95, 54.35] },
    });
    assert(gs.status === 200 && (gs.json.counting_slots ?? gs.json.slots_required) === 3);
    assertClose2(gs.json.simulated_points, 58.38, 'GS 2-res sim');
    assertClose2(gs.json.multiplier ?? gs.json.penalty_multiplier, 1.20, 'GS +20%');

    const sl = await apiJson(apiUrl, '/calc/list-sim', {
      method: 'POST',
      body: { discipline: 'SL', season: 2027, results: [50.0] },
    });
    assert(sl.status === 200 && (sl.json.counting_slots ?? sl.json.slots_required) === 3);
    assertClose2(sl.json.simulated_points, 72.00, 'SL 1-res sim');
    assertClose2(sl.json.multiplier ?? sl.json.penalty_multiplier, 1.44, 'SL +44%');
    return { gs: gs.json.simulated_points, sl: sl.json.simulated_points };
  });

  await check('T1-F09-06', '#9 Decimal Rules', 'POST /calc/list-sim Season 2027 Best-2 SG/DH rules', async () => {
    const sg = await apiJson(apiUrl, '/calc/list-sim', {
      method: 'POST',
      body: { discipline: 'SG', season: 2027, results: [85.5] },
    });
    assert(sg.status === 200 && (sg.json.counting_slots ?? sg.json.slots_required) === 2);
    assertClose2(sg.json.simulated_points, 102.60, 'SG 1-res sim');

    const dh = await apiJson(apiUrl, '/calc/list-sim', {
      method: 'POST',
      body: { discipline: 'DH', season: 2027, results: [40.0, 50.0, 60.0] },
    });
    assert(dh.status === 200 && (dh.json.counting_slots ?? dh.json.slots_required) === 2);
    assertClose2(dh.json.simulated_points, 45.00, 'DH best-2 sim');
    return { sg: sg.json.simulated_points, dh: dh.json.simulated_points };
  });

  // ================= FEATURE #10: /hub Switchboard LIVE Mode =================
  await cdp.setViewport(390, 844);
  await cdp.navigate(`${baseUrl}/hub`);

  await check('T1-F10-01', '#10 Hub LIVE', 'Switchboard shows 4 mode tabs with strictly single active tabpanel', async () => {
    const info = await cdp.evaluate(`(() => {
      const tabs = Array.from(document.querySelectorAll('[role="tab"]')).map(t => ({
        text: t.innerText.trim(),
        selected: t.getAttribute('aria-selected'),
      }));
      const visiblePanels = Array.from(document.querySelectorAll('[role="tabpanel"]')).filter(p => !p.hidden && getComputedStyle(p).display !== 'none').length;
      return { tabs, visiblePanels };
    })()`);
    assert(info.tabs.length === 4, `Expected 4 tabs, got ${JSON.stringify(info.tabs)}`);
    assert(info.visiblePanels === 1, `Expected 1 visible tabpanel, got ${info.visiblePanels}`);
    return info;
  });

  await check('T1-F10-02', '#10 Hub LIVE', 'LIVE board loads 2026-04-11 races including SKIBEC / MSA 309223', async () => {
    await fillFieldMatching(cdp, 'DATE', '2026-04-11');
    await waitForCondition(cdp, () => /SUPER SERIE|SKIBEC/i.test(document.body.innerText), 4000, 50);
    const txt = await getBodyText(cdp);
    assert(/SUPER SERIE|SKIBEC/i.test(txt) && /0484|484/.test(txt), `MSA race row missing in LIVE board: ${txt.slice(0, 300)}`);
    return 'MSA race card visible';
  });

  await check('T1-F10-03', '#10 Hub LIVE', 'Filter buttons (LIVE NOW, FIS, CAN/USA, ALL) update race list cleanly', async () => {
    await clickButtonMatching(cdp, 'FIS');
    await waitForCondition(cdp, () => /SUPER SERIE|SKIBEC/i.test(document.body.innerText), 2000, 40);
    const fisText = await getBodyText(cdp);
    assert(/SUPER SERIE|SKIBEC/i.test(fisText), 'FIS filter hid MSA FIS race');
    await clickButtonMatching(cdp, 'CAN/USA');
    await clickButtonMatching(cdp, '^ALL$');
    await waitForCondition(cdp, () => /SUPER SERIE|SKIBEC/i.test(document.body.innerText), 2000, 40);
    return 'filters interactive';
  });

  await check('T1-F10-04', '#10 Hub LIVE', 'Quick-load MSA 309223 or date selection triggers HTTP 200 API fetch', async () => {
    await cdp.navigate(`${baseUrl}/hub`);
    await fillFieldMatching(cdp, 'DATE', '2026-04-11');
    await waitForCondition(
      cdp,
      async () => cdp.networkResponses.some((r) => r.url.includes('/api/hub/races') && r.status === 200),
      4000,
      50
    );
    const apiOk = cdp.networkResponses.some((r) => r.url.includes('/api/hub/races') && r.status === 200);
    assert(apiOk, 'No HTTP 200 /api/hub/races network call observed');
    return 'HTTP 200 /api/hub/races observed';
  });

  await check('T1-F10-05', '#10 Hub LIVE', 'Clicking a race card switches active tab to RACE', async () => {
    await clickButtonMatching(cdp, '309223|0484');
    await waitForCondition(
      cdp,
      () => /RACE|COURSE/i.test(document.querySelector('[role="tab"][aria-selected="true"]')?.innerText || ''),
      4000,
      50
    );
    const selectedRace = await cdp.evaluate(`document.querySelector('[role="tab"][aria-selected="true"]')?.innerText || ''`);
    assert(/RACE|COURSE/i.test(selectedRace), `Expected active tab RACE, got ${selectedRace}`);
    return { activeTab: selectedRace.trim() };
  });

  // ================= FEATURE #11: /hub RACE Live Telemetry & Penalty Sheet =================
  await check('T1-F11-01', '#11 Hub RACE', '4-cell telemetry strip renders Penalty, Leader To, F-VALUE (1010), Status', async () => {
    await waitForCondition(cdp, () => /1010/.test(document.body.innerText), 4000, 50);
    const txt = await getBodyText(cdp);
    assert(/PENALTY/i.test(txt) && /109\.47|1:49\.47/.test(txt) && /1010/.test(txt) && /PROVISIONAL|LIVE|OFFICIAL/i.test(txt), `Telemetry strip missing values`);
    return 'telemetry strip verified';
  });

  await check('T1-F11-02', '#11 Hub RACE', 'Season 2027 +8 adder and 2xMax/CLAMPED badges render accurately', async () => {
    await fillFieldMatching(cdp, 'SEASON', '2027');
    await waitForCondition(cdp, () => /\+8/.test(document.body.innerText) || /32\.25/.test(document.body.innerText), 3000, 50);
    const txt = await getBodyText(cdp);
    assert(/\+8/.test(txt) || /32\.25/.test(txt), 'Missing Season 2027 +8 adder badge/value on MSA 309223');

    await cdp.mockJsonRoutes(buildSyntheticLiveRaceRoutes(vectors));
    try {
      await switchHubTab(cdp, 'LIVE');
      await fillFieldMatching(cdp, 'DATE', '2026-11-16');
      await waitForCondition(cdp, () => /CERRO CASTOR/i.test(document.body.innerText), 4000, 50);
      await clickButtonMatching(cdp, 'CERRO CASTOR');
      await waitForCondition(cdp, () => /330\.00/.test(document.body.innerText), 4000, 50);
      const raceTxt = await getBodyText(cdp);
      assert(/330\.00/.test(raceTxt) && /2×MAX|2xMAX/i.test(raceTxt), `Missing 2xMAX badge/330.00: ${raceTxt.slice(0, 300)}`);
    } finally {
      await cdp.clearMockRoutes();
    }
    return '+8 & 2xMAX badges verified';
  });

  await check('T1-F11-03', '#11 Hub RACE', 'Racer rows render Rank, Bib, Name, Time, Expected Pts including Julian', async () => {
    await switchHubTab(cdp, 'LIVE');
    await fillFieldMatching(cdp, 'DATE', '2026-04-11');
    await waitForCondition(cdp, () => /SUPER SERIE|SKIBEC/i.test(document.body.innerText), 4000, 50);
    await clickButtonMatching(cdp, '309223|0484');
    await waitForCondition(cdp, () => /BRUNET,\s*Julian/i.test(document.body.innerText), 4000, 50);
    const info = await cdp.evaluate(`(() => {
      const text = document.body.innerText;
      const rows = Array.from(document.querySelectorAll('#race-view-results button, [role="tabpanel"] button')).filter(b => /ST-GERMAIN|BRUNET/i.test(b.innerText));
      const minH = rows.length ? Math.min(...rows.map(r => r.getBoundingClientRect().height)) : 0;
      return { hasJulian: /BRUNET,\\s*Julian/i.test(text), hasTime: /1:50\\.63/.test(text), rowCount: rows.length, minH };
    })()`);
    assert(info.hasJulian && info.hasTime && info.minH >= 44, `Racer rows check failed: ${JSON.stringify(info)}`);
    return info;
  });

  await check('T1-F11-04', '#11 Hub RACE', 'Tapping racer row expands splits and exposes Target Time jump to CALC', async () => {
    await clickButtonMatching(cdp, 'BRUNET,\\s*Julian');
    await waitForCondition(cdp, () => /56\.96/.test(document.body.innerText) && /53\.67/.test(document.body.innerText), 3000, 50);
    const expandedText = await getBodyText(cdp);
    assert(/56\.96/.test(expandedText) && /53\.67/.test(expandedText), 'Expanded R1/R2 splits missing');
    await clickButtonMatching(cdp, 'Target Time|CALC TARGET');
    await waitForCondition(
      cdp,
      () => /CALC|CALCUL/i.test(document.querySelector('[role="tab"][aria-selected="true"]')?.innerText || ''),
      3000,
      50
    );
    const activeTab = await cdp.evaluate(`document.querySelector('[role="tab"][aria-selected="true"]')?.innerText || ''`);
    assert(/CALC|CALCUL/i.test(activeTab), `Target Time jump did not open CALC tab: ${activeTab}`);
    return 'row expand & Target Time jump verified';
  });

  await check('T1-F11-05', '#11 Hub RACE', 'PENALTY BREAKDOWN view renders Sum A, Sum B, Sum C', async () => {
    await switchHubTab(cdp, 'RACE');
    await clickButtonMatching(cdp, 'PENALTY BREAKDOWN');
    await waitForCondition(cdp, () => /143\.1/.test(document.body.innerText) && /121\.95/.test(document.body.innerText), 3000, 50);
    const txt = await getBodyText(cdp);
    assert(/143\.1/.test(txt) && /121\.95/.test(txt) && /22\.6/.test(txt), `Penalty breakdown missing Sum A/B/C`);
    return 'Sum A/B/C visible';
  });

  await check('T1-F11-06', '#11 Hub RACE', 'START LIST / H2H sub-view renders threats panel cleanly', async () => {
    await clickButtonMatching(cdp, 'START LIST|H2H');
    await waitForCondition(cdp, () => /THREATS|START LIST/i.test(document.body.innerText), 3000, 50);
    const txt = await getBodyText(cdp);
    assert(/THREATS|START LIST/i.test(txt), 'Missing threats panel');
    return 'H2H threats rendered';
  });

  // ================= FEATURE #12: /hub CALC & ATHLETES + Explainer =================
  await check('T1-F12-01', '#12 Hub CALC & Athletes', 'CALC includes concise Race Points vs List Points explainer', async () => {
    await switchHubTab(cdp, 'CALC');
    const txt = await getBodyText(cdp);
    assert(/Race Points/i.test(txt) && /List Points/i.test(txt), 'Missing Race Points vs List Points explainer');
    return 'explainer present';
  });

  await check('T1-F12-02', '#12 Hub CALC & Athletes', 'Target Time UI computes 1:50.63 (110.63s) and Run 2 53.67s', async () => {
    await fillFieldMatching(cdp, 'Leader Time', '109.47');
    await fillFieldMatching(cdp, '^Discipline$', 'GS', 'i', '#target-form').catch(() =>
      fillFieldMatching(cdp, 'Discipline', 'GS')
    );
    await fillFieldMatching(cdp, 'Penalty', '24.25');
    await fillFieldMatching(cdp, 'Target FIS', '34.95');
    await fillFieldMatching(cdp, 'Run 1 Time', '56.96');
    await clickButtonMatching(cdp, 'CALCULATE TARGET|COMPUTE TARGET');
    await waitForCondition(cdp, () => /1:50\.63|110\.63/.test(document.body.innerText) && /53\.67/.test(document.body.innerText), 3000, 50);
    const txt = await getBodyText(cdp);
    assert(/1:50\.63|110\.63/.test(txt) && /53\.67/.test(txt), `Target UI output wrong: ${txt.slice(0, 400)}`);
    return 'target UI verified';
  });

  await check('T1-F12-03', '#12 Hub CALC & Athletes', 'Next-List Simulator UI computes 58.38 (+20%) for Season 2027 GS', async () => {
    await fillFieldMatching(cdp, '^Discipline$', 'GS', 'i', '#sim-form').catch(() =>
      fillFieldMatching(cdp, 'Sim Discipline|^Discipline$', 'GS', 'i', '#sim-form')
    );
    await fillFieldMatching(cdp, '^Season$', '2027', 'i', '#sim-form').catch(() =>
      fillFieldMatching(cdp, 'Sim Season|^Season$', '2027', 'i', '#sim-form')
    );
    await fillFieldMatching(cdp, 'Race Scores|^Results$', '42.95, 54.35', 'i', '#sim-form');
    await clickButtonMatching(cdp, 'SIMULATE LIST');
    await waitForCondition(cdp, () => /58\.38/.test(document.body.innerText), 3000, 50);
    const txt = await getBodyText(cdp);
    assert(/58\.38/.test(txt) && (/1\.2/.test(txt) || /20%/.test(txt)), `Sim UI output wrong: ${txt.slice(0, 400)}`);
    return 'sim UI 58.38 verified';
  });

  await check('T1-F12-04', '#12 Hub CALC & Athletes', 'ATHLETES lookup UI finds inactive 6100596 and renders bio points', async () => {
    await switchHubTab(cdp, 'ATHLETES');
    await fillFieldMatching(cdp, 'Search FIS|FIS code', '6100596');
    await clickButtonMatching(cdp, 'SEARCH ATHLETE|^SEARCH$');
    await waitForCondition(cdp, () => /BRUNET/i.test(document.body.innerText), 3000, 50);
    await clickButtonMatching(cdp, 'BRUNET');
    await waitForCondition(cdp, () => /58\.38/.test(document.body.innerText) && /93\.52/.test(document.body.innerText), 3000, 50);
    const txt = await getBodyText(cdp);
    assert(/BRUNET/i.test(txt) && /58\.38/.test(txt) && /93\.52/.test(txt) && /NOT ACTIVE|Not active|INACTIVE/i.test(txt), `Athlete 6100596 UI missing data`);
    return '6100596 UI verified';
  });

  await check('T1-F12-05', '#12 Hub CALC & Athletes', 'ATHLETES lookup UI finds active athlete and shows H2H readiness', async () => {
    await fillFieldMatching(cdp, 'Search FIS|FIS code', '502015');
    await clickButtonMatching(cdp, 'SEARCH ATHLETE|^SEARCH$');
    await waitForCondition(cdp, () => /JAKOBSEN/i.test(document.body.innerText), 3000, 50);
    await clickButtonMatching(cdp, 'JAKOBSEN');
    await waitForCondition(cdp, () => /14\.95/.test(document.body.innerText), 3000, 50);
    const txt = await getBodyText(cdp);
    assert(/JAKOBSEN/i.test(txt) && /ACTIVE/i.test(txt) && /14\.95/.test(txt), `Active athlete UI missing data`);
    return 'active athlete UI verified';
  });

  await check('T1-F12-06', '#12 Hub CALC & Athletes', '/hub EN/FR toggle translates tabs cleanly without overflow', async () => {
    await setLocale(cdp, 'FR');
    const txt = await getBodyText(cdp);
    assert(/EN DIRECT|CALCUL|ATHLÈTES/i.test(txt), 'Hub FR tabs missing');
    await cdp.assertNoHorizontalOverflow(390, '/hub FR 390px');
    await setLocale(cdp, 'EN');
    return 'Hub EN/FR verified';
  });

  // ================= FEATURE #13: Navigation Closure (/not-found & /partners) =================
  await check('T1-F13-01', '#13 Route Closure', '/not-found returns genuine HTTP 404 status', async () => {
    const nav = await cdp.navigate(`${baseUrl}/not-found`, { ignoreStatusErrors: true });
    assert(nav.documentStatus === 404, `Expected HTTP 404 on /not-found, got ${nav.documentStatus}`);
    return { status: nav.documentStatus };
  });

  await check('T1-F13-02', '#13 Route Closure', '404 page renders DNF / DSQ, "You missed a gate.", and >= 44px recovery links', async () => {
    const info = await cdp.evaluate(`(() => {
      const txt = document.body.innerText;
      const links = Array.from(document.querySelectorAll('main a[href]')).map(a => ({
        href: a.getAttribute('href'),
        h: a.getBoundingClientRect().height,
        w: a.getBoundingClientRect().width,
      }));
      return { txt, h1Count: document.querySelectorAll('h1').length, links };
    })()`);
    assert(info.h1Count === 1, `Expected 1 h1 on 404, got ${info.h1Count}`);
    assert(/You missed a gate\./i.test(info.txt) && /DNF|DSQ/i.test(info.txt), `Missing DNF/DSQ or 'You missed a gate.'`);
    assert(info.links.some((l) => l.href === '/' && l.h >= 44 && l.w >= 44), 'Missing >= 44px recovery link to /');
    return info.links;
  });

  await check('T1-F13-03', '#13 Route Closure', '/partners returns HTTP 200 with single h1 and Finish Area shell', async () => {
    await cdp.setViewport(1440, 900);
    const nav = await cdp.navigate(`${baseUrl}/partners`);
    assert(nav.documentStatus === 200, `/partners status=${nav.documentStatus}`);
    const h1Count = await cdp.evaluate('document.querySelectorAll("h1").length');
    const txt = await getBodyText(cdp);
    assert(h1Count === 1 && /FINISH AREA|PARTNERS/i.test(txt), 'Missing Finish Area heading on /partners');
    return { status: nav.documentStatus, h1Count };
  });

  await check('T1-F13-04', '#13 Route Closure', '/partners displays verified facts only and excludes 58.38', async () => {
    const txt = await getBodyText(cdp);
    for (const reqTok of ['34.95', '#459', '6', '147', '96', 'Mont Garceau']) {
      assert(txt.includes(reqTok), `/partners missing verified fact: ${reqTok}`);
    }
    assert(!txt.includes('58.38'), 'Unverified 58.38 leaked onto /partners');
    return 'verified /partners facts & 58.38 exclusion';
  });

  await check('T1-F13-05', '#13 Route Closure', '/partners includes accessible >= 44px inquiry/contact CTA', async () => {
    const cta = await cdp.evaluate(`(() => {
      const el = Array.from(document.querySelectorAll('main a, main button')).find(e => /inquiry|contact|media kit|mailto/i.test((e.innerText || '') + ' ' + (e.getAttribute('href') || '')));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { text: el.innerText.trim(), w: r.width, h: r.height };
    })()`);
    assert(cta && cta.w >= 44 && cta.h >= 44, `Missing >= 44px inquiry CTA: ${JSON.stringify(cta)}`);
    return cta;
  });

  await check('T1-F13-06', '#13 Route Closure', 'TimingRail links highlight active route and navigate across /partners -> /hub -> /#course-gates', async () => {
    const activeOk = await cdp.evaluate(`Boolean(document.querySelector('nav a[href="/partners"][aria-current="page"]'))`);
    assert(activeOk, 'TimingRail /partners link missing aria-current="page"');
    await clickButtonMatching(cdp, 'TIMING\\s+HUB|\\bHUB\\b');
    await waitForCondition(cdp, () => window.location.pathname === '/hub', 3000, 50);
    const hubUrl = await cdp.evaluate('window.location.pathname');
    assert(hubUrl === '/hub', `Expected /hub, got ${hubUrl}`);
    await clickButtonMatching(cdp, 'THE COURSE|GATES');
    await waitForCondition(cdp, () => window.location.pathname === '/', 3000, 50);
    const homeUrl = await cdp.evaluate('window.location.pathname + window.location.hash');
    assert(homeUrl.startsWith('/'), `Failed navigating from /hub to /: ${homeUrl}`);
    return { hubUrl, homeUrl };
  });

  return runner.finish();
}
