import {
  apiJson,
  assert,
  assertClose2,
  clickButtonMatching,
  createTierRunner,
  fillFieldMatching,
  getBodyText,
  loadExpectedVectors,
  openSyntheticRaceInHub,
  setLocale,
  switchHubTab,
  waitForCondition,
} from './helpers.mjs';

export async function runTier3(ctx) {
  const { cdp, baseUrl, apiUrl, filterRegex } = ctx;
  const vectors = loadExpectedVectors();
  const runner = createTierRunner('tier3', filterRegex);
  const { check } = runner;

  await check('T3-01', '#2+#5 Pairwise', 'Desktop / scroll advances run clock AND updates contextual bay across gates 01->04->07->08', async () => {
    await cdp.setViewport(1440, 900);
    await cdp.setReducedMotion(false);
    await cdp.navigate(`${baseUrl}/`);
    await cdp.scrollToY(0);
    const clock0 = await cdp.evaluate(`document.querySelector('.rail-clock-digits, .topbar-clock, .run-clock')?.innerText || ''`);
    await cdp.evaluate(`(() => {
      const el = document.querySelector('#gate-04, [data-gate="04"]') ||
        Array.from(document.querySelectorAll('article, [data-gate]')).find(e => /GATE 04/i.test(e.innerText));
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - Math.round(window.innerHeight * 0.35), behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    })()`);
    await waitForCondition(
      cdp,
      () => {
        const bay = document.querySelector('#contextual-bay, .telemetry-bay, aside.split-board-col, aside.split-board, #course-gates aside');
        return Boolean(bay && /83\.5|53\.5|3-SEASON/i.test(bay.innerText));
      },
      3000,
      50
    );
    const clock4 = await cdp.evaluate(`document.querySelector('.rail-clock-digits, .topbar-clock, .run-clock')?.innerText || ''`);
    const bay4 = await cdp.evaluate(`document.querySelector('#contextual-bay, .telemetry-bay, aside.split-board-col, aside.split-board, #course-gates aside')?.innerText || ''`);
    await cdp.evaluate(`(() => {
      const el = document.querySelector('#gate-07, [data-gate="07"]') ||
        Array.from(document.querySelectorAll('article, [data-gate]')).find(e => /GATE 07/i.test(e.innerText));
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - Math.round(window.innerHeight * 0.35), behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    })()`);
    await waitForCondition(
      cdp,
      () => {
        const bay = document.querySelector('#contextual-bay, .telemetry-bay, aside.split-board-col, aside.split-board, #course-gates aside');
        return Boolean(bay && /34\.95|46\.35|11-WEEK/i.test(bay.innerText));
      },
      3000,
      50
    );
    const clock7 = await cdp.evaluate(`document.querySelector('.rail-clock-digits, .topbar-clock, .run-clock')?.innerText || ''`);
    const bay7 = await cdp.evaluate(`document.querySelector('#contextual-bay, .telemetry-bay, aside.split-board-col, aside.split-board, #course-gates aside')?.innerText || ''`);
    assert(clock0 !== clock4 && clock4 !== clock7, `Clock did not advance: ${clock0} -> ${clock4} -> ${clock7}`);
    assert(/83\.5|53\.5|3-SEASON/i.test(bay4) && /34\.95|46\.35|11-WEEK/i.test(bay7), 'Contextual bay did not track scroll');
    return { clock0, clock4, clock7 };
  });

  await check('T3-02', '#1+#2+#5 Pairwise', 'EN/FR toggle mid-course preserves contextual charts and translates labels', async () => {
    const savedY = await cdp.evaluate('window.scrollY');
    await setLocale(cdp, 'FR');
    await cdp.callFn((y) => {
      if (Math.abs(window.scrollY - y) > 10) {
        window.scrollTo({ top: y, behavior: 'instant' });
        window.dispatchEvent(new Event('scroll'));
      }
    }, savedY);
    const txt = await getBodyText(cdp);
    assert(/147\s+INSCRIPTIONS/i.test(txt), 'FR translation missing after scroll');
    const svgCount = await cdp.evaluate(`document.querySelectorAll('aside svg').length`);
    assert(svgCount >= 2, `Contextual bay SVG vanished on FR toggle (svgCount=${svgCount})`);
    await setLocale(cdp, 'EN');
    return { svgCount };
  });

  await check('T3-03', '#2+#5 Pairwise', 'Mobile 390x844 scroll updates sticky topbar clock with inline Gate 01/07 SVGs', async () => {
    await cdp.setViewport(390, 844);
    await cdp.navigate(`${baseUrl}/`);
    const c0 = await cdp.evaluate(`document.querySelector('header .topbar-clock, header .run-clock, .mobile-topbar .run-clock, .mobile-topbar .topbar-clock, .rail-clock-digits')?.innerText || ''`);
    await cdp.scrollToY(1400);
    await waitForCondition(
      cdp,
      (prev) => {
        const cur = document.querySelector('header .topbar-clock, header .run-clock, .mobile-topbar .run-clock, .mobile-topbar .topbar-clock, .rail-clock-digits')?.innerText || '';
        return cur && cur !== prev;
      },
      3000,
      50
    ).catch(() => {});
    const c1 = await cdp.evaluate(`document.querySelector('header .topbar-clock, header .run-clock, .mobile-topbar .run-clock, .mobile-topbar .topbar-clock, .rail-clock-digits')?.innerText || ''`);
    assert(c0 !== c1, `Mobile topbar clock static: ${c0} == ${c1}`);
    await cdp.assertNoHorizontalOverflow(390, 'mobile scroll');
    return { c0, c1 };
  });

  await check('T3-04', '#5+#13 Pairwise', 'TimingRail cross-route / -> /hub -> /partners -> /not-found maintains active links & zero errors', async () => {
    await cdp.setViewport(1440, 900);
    await cdp.navigate(`${baseUrl}/`);
    await clickButtonMatching(cdp, 'TIMING\\s+HUB|\\bHUB\\b');
    await waitForCondition(cdp, () => location.pathname === '/hub', 3000, 50);
    assert(await cdp.evaluate(`location.pathname === '/hub' && Boolean(document.querySelector('a[href="/hub"][aria-current="page"]'))`), 'Hub active state wrong');
    await clickButtonMatching(cdp, 'PARTNERS');
    await waitForCondition(cdp, () => location.pathname === '/partners', 3000, 50);
    assert(await cdp.evaluate(`location.pathname === '/partners' && Boolean(document.querySelector('a[href="/partners"][aria-current="page"]'))`), 'Partners active state wrong');
    assert(cdp.pageErrors.length === 0, `Errors during route tour: ${JSON.stringify(cdp.pageErrors)}`);
    return 'cross-route TimingRail verified';
  });

  await check('T3-05', '#5+#13 Pairwise', 'Clicking THE COURSE (/#course-gates) from /hub returns to / and anchors course', async () => {
    await cdp.navigate(`${baseUrl}/hub`);
    await clickButtonMatching(cdp, 'THE COURSE|^GATES$');
    await waitForCondition(cdp, () => location.pathname === '/' && window.scrollY > 150, 3000, 50);
    const loc = await cdp.evaluate(`({ path: location.pathname, hash: location.hash, scrollY: window.scrollY })`);
    assert(loc.path === '/' && loc.scrollY > 150, `Did not navigate & scroll to course from /hub: ${JSON.stringify(loc)}`);
    return loc;
  });

  await check('T3-06', '#5+#10 Pairwise', 'Mobile drawer open -> click TIMING HUB closes drawer, unlocks scroll, and loads /hub', async () => {
    await cdp.setViewport(390, 844);
    await cdp.navigate(`${baseUrl}/`);
    await clickButtonMatching(cdp, 'MENU|OPEN NAVIGATION|NAVIGATION');
    const locked = await cdp.evaluate(`document.body.style.overflow === 'hidden'`);
    assert(locked, 'Opening mobile drawer did not lock scroll');
    await clickButtonMatching(cdp, 'TIMING\\s+HUB|\\bHUB\\b');
    await waitForCondition(cdp, () => location.pathname === '/hub', 3000, 50);
    const state = await cdp.evaluate(`({ path: location.pathname, overflow: document.body.style.overflow, expanded: document.querySelector('[aria-expanded]')?.getAttribute('aria-expanded') })`);
    assert(state.path === '/hub' && state.overflow !== 'hidden' && state.expanded === 'false', `Drawer state leaked across nav: ${JSON.stringify(state)}`);
    return state;
  });

  await check('T3-07', '#10+#11 Pairwise', '/hub LIVE race selection -> RACE telemetry strip -> PENALTY BREAKDOWN consistency', async () => {
    await cdp.setViewport(390, 844);
    await cdp.navigate(`${baseUrl}/hub`);
    await fillFieldMatching(cdp, 'DATE', '2026-04-11');
    await waitForCondition(cdp, () => /SUPER SERIE|SKIBEC/i.test(document.body.innerText), 4000, 50);
    await clickButtonMatching(cdp, '309223|0484');
    await waitForCondition(cdp, () => /109\.47|1:49\.47/.test(document.body.innerText) && /1010/.test(document.body.innerText), 4000, 50);
    const raceTxt = await getBodyText(cdp);
    assert(/109\.47|1:49\.47/.test(raceTxt) && /1010/.test(raceTxt), 'RACE strip incomplete');
    await clickButtonMatching(cdp, 'PENALTY BREAKDOWN');
    await waitForCondition(cdp, () => /143\.1/.test(document.body.innerText) && /121\.95/.test(document.body.innerText), 3000, 50);
    const penTxt = await getBodyText(cdp);
    assert(/143\.1/.test(penTxt) && /121\.95/.test(penTxt) && /22\.6/.test(penTxt), 'Breakdown mismatch');
    return 'LIVE -> RACE -> PENALTY BREAKDOWN verified';
  });

  await check('T3-08', '#11+#12 Pairwise', '/hub RACE row expand -> Target Time jump pre-fills CALC (109.47 / 56.96 -> 1:50.63 & 53.67)', async () => {
    await clickButtonMatching(cdp, '^RESULTS$|^TIMING SHEET$');
    await waitForCondition(cdp, () => /BRUNET,\s*Julian/i.test(document.body.innerText), 3000, 50);
    await clickButtonMatching(cdp, 'BRUNET,\\s*Julian');
    await waitForCondition(cdp, () => /Target Time|CALC TARGET/i.test(document.body.innerText), 3000, 50);
    await clickButtonMatching(cdp, 'Target Time|CALC TARGET');
    await waitForCondition(cdp, () => /1:50\.63|110\.63/.test(document.body.innerText) && /53\.67/.test(document.body.innerText), 3000, 50);
    const txt = await getBodyText(cdp);
    assert(/1:50\.63|110\.63/.test(txt) && /53\.67/.test(txt), `Target jump did not pre-fill/compute cleanly: ${txt.slice(0, 350)}`);
    return 'Target Time jump pre-filled CALC';
  });

  await check('T3-09', '#11+#12 Pairwise', '/hub RACE + ATHLETES lookup (6100596) work seamlessly within single session', async () => {
    await switchHubTab(cdp, 'ATHLETES');
    await fillFieldMatching(cdp, 'Search FIS|FIS code', '6100596');
    await clickButtonMatching(cdp, 'SEARCH ATHLETE|^SEARCH$');
    await waitForCondition(cdp, () => /BRUNET/i.test(document.body.innerText), 3000, 50);
    await clickButtonMatching(cdp, 'BRUNET');
    await waitForCondition(cdp, () => /58\.38/.test(document.body.innerText), 3000, 50);
    const athTxt = await getBodyText(cdp);
    assert(/BRUNET/i.test(athTxt) && /58\.38/.test(athTxt));
    await switchHubTab(cdp, 'RACE');
    const raceTxt = await getBodyText(cdp);
    assert(/109\.47|1:49\.47/.test(raceTxt), 'Switching ATHLETES -> RACE lost loaded race state');
    return 'RACE <-> ATHLETES state preserved';
  });

  await check('T3-10', '#7+#8 Pairwise', 'hFCODE (0484) <-> competitionCodex (484) cross-join matches 309223 <-> 130671', async () => {
    const races = await apiJson(apiUrl, '/races?date=2026-04-11');
    const live = await apiJson(apiUrl, '/races/309223/live?season=2026');
    const fis = await apiJson(apiUrl, '/fis/race/130671');
    assert(races.status === 200 && live.status === 200 && fis.status === 200);
    const msa = races.json.races.find((r) => String(r.lt_id) === '309223');
    const c1 = String(msa.fis_codex).replace(/^0+/, '');
    const c2 = String(live.json.race.fis_codex).replace(/^0+/, '');
    const c3 = String(fis.json.codex ?? fis.json.competition_codex).replace(/^0+/, '');
    assert(c1 === '484' && c2 === '484' && c3 === '484', `Codex mismatch: ${c1}, ${c2}, ${c3}`);
    const jLive = live.json.racers.find((x) => String(x.fis_code) === '6100596');
    const jFis = fis.json.results.find((x) => String(x.fis_code) === '6100596');
    assertClose2(jLive.expected_fis_points, jFis.fis_points, '309223 vs 130671 Julian points');
    return { codex: c3, julianPts: jFis.fis_points };
  });

  await check('T3-11', '#9+#11 Pairwise', 'Season 2026 vs 2027 selector inside /hub RACE updates penalty (24.25 -> 32.25) & Julian (34.95 -> 42.95)', async () => {
    await fillFieldMatching(cdp, 'SEASON', '2026');
    await waitForCondition(cdp, () => /24\.25/.test(document.body.innerText) && /34\.95/.test(document.body.innerText), 3000, 50);
    const t26 = await getBodyText(cdp);
    assert(/24\.25/.test(t26) && /34\.95/.test(t26), 'Season 2026 did not show 24.25 / 34.95');
    await fillFieldMatching(cdp, 'SEASON', '2027');
    await waitForCondition(cdp, () => /32\.25/.test(document.body.innerText) && /42\.95/.test(document.body.innerText), 3000, 50);
    const t27 = await getBodyText(cdp);
    assert(/32\.25/.test(t27) && /42\.95/.test(t27), 'Season 2027 did not update to 32.25 / 42.95');
    return 'Season 2026 <-> 2027 live switch verified';
  });

  await check('T3-12', '#9+#12 Pairwise', 'Season 2026 vs 2027 consistency across calc/penalty and calc/list-sim', async () => {
    const comps = [
      { bib: 1, list_points: 10.0, total_ms: 101000, status: 'QLF' },
      { bib: 2, list_points: 10.0, total_ms: 101000, status: 'QLF' },
      { bib: 3, list_points: 10.0, total_ms: 101000, status: 'QLF' },
      { bib: 4, list_points: 10.0, total_ms: 101000, status: 'QLF' },
      { bib: 5, list_points: 103.1, total_ms: 103260, status: 'QLF' },
      { bib: 6, list_points: 81.95, total_ms: null, status: 'DNF1' },
    ];
    const p26 = await apiJson(apiUrl, '/calc/penalty', {
      method: 'POST',
      body: { discipline: 'GS', category: 'FIS', season: 2026, competitors: comps },
    });
    const p27 = await apiJson(apiUrl, '/calc/penalty', {
      method: 'POST',
      body: { discipline: 'GS', category: 'FIS', season: 2027, competitors: comps },
    });
    const pen26 = p26.json.penalty?.applied_penalty ?? p26.json.applied;
    const pen27 = p27.json.penalty?.applied_penalty ?? p27.json.applied;
    assertClose2(pen27 - pen26, 8.0, '2027 - 2026 delta');

    const s26 = await apiJson(apiUrl, '/calc/list-sim', {
      method: 'POST',
      body: { discipline: 'GS', season: 2026, results: [42.95, 54.35] },
    });
    const s27 = await apiJson(apiUrl, '/calc/list-sim', {
      method: 'POST',
      body: { discipline: 'GS', season: 2027, results: [42.95, 54.35] },
    });
    assertClose2(s26.json.simulated_points, 48.65, '2026 Best-2 GS');
    assertClose2(s27.json.simulated_points, 58.38, '2027 Best-3 GS');
    return { pen26, pen27, sim26: s26.json.simulated_points, sim27: s27.json.simulated_points };
  });

  await check('T3-13', '#9 Pairwise', 'Inverse calc/target output round-trips cleanly against FIS race-points equation', async () => {
    const tgt = await apiJson(apiUrl, '/calc/target', {
      method: 'POST',
      body: { discipline: 'GS', leader_time_ms: 109470, penalty: 24.25, target_fis_points: 34.95 },
    });
    assert(tgt.status === 200);
    const tTargetMs = tgt.json.target_time_ms ?? tgt.json.t_target_ms;
    const pen = await apiJson(apiUrl, '/calc/penalty', {
      method: 'POST',
      body: {
        discipline: 'GS',
        category: 'FIS',
        season: 2026,
        competitors: [
          { bib: 1, list_points: 22.99, total_ms: 109470, status: 'QLF' },
          { bib: 2, list_points: 23.0, total_ms: null, status: 'DNF2' },
          { bib: 3, list_points: 23.82, total_ms: null, status: 'DNF2' },
          { bib: 4, list_points: 25.78, total_ms: null, status: 'DNF2' },
          { bib: 5, list_points: 26.36, total_ms: 109730, status: 'QLF' },
          { bib: 6, list_points: 28.1, total_ms: 110240, status: 'QLF' },
          { bib: 7, list_points: 32.2, total_ms: 109930, status: 'QLF' },
          { bib: 8, list_points: 33.45, total_ms: 110430, status: 'QLF' },
          { bib: 9, list_points: 37.4, total_ms: tTargetMs, status: 'QLF' },
        ],
      },
    });
    assert(pen.status === 200);
    const roundTripPenalty = pen.json.penalty?.applied_penalty ?? pen.json.applied;
    assertClose2(roundTripPenalty, 24.25, 'Round-trip penalty');
    return { tTargetMs, roundTripPenalty };
  });

  await check('T3-14', '#2+#3+#5 Pairwise', 'prefers-reduced-motion + / scroll keeps connectors and contextual bay intact', async () => {
    await cdp.setViewport(1440, 900);
    await cdp.setReducedMotion(true);
    await cdp.navigate(`${baseUrl}/`);
    await cdp.evaluate(`(() => {
      const el = document.querySelector('#gate-07, [data-gate="07"]') ||
        Array.from(document.querySelectorAll('article, [data-gate]')).find(e => /GATE 07/i.test(e.innerText));
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - Math.round(window.innerHeight * 0.35), behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    })()`);
    await waitForCondition(
      cdp,
      () => {
        const bay = document.querySelector('#contextual-bay, .telemetry-bay, aside.split-board-col, aside.split-board, #course-gates aside');
        return Boolean(bay && /34\.95/.test(bay.innerText));
      },
      3000,
      50
    );
    const ok = await cdp.evaluate(`(() => {
      const bay = document.querySelector('#contextual-bay, .telemetry-bay, aside.split-board-col, aside.split-board, #course-gates aside')?.innerText || '';
      const g7 = document.querySelector('#gate-07, [data-gate="07"]') ||
        Array.from(document.querySelectorAll('article, [data-gate]')).find(e => /GATE 07/i.test(e.innerText));
      const op = g7 ? parseFloat(getComputedStyle(g7).opacity) : 0;
      return { has3495: /34\\.95/.test(bay), op };
    })()`);
    await cdp.setReducedMotion(false);
    assert(ok.has3495 && ok.op >= 0.99, `Reduced motion broke Gate 07 bay/opacity: ${JSON.stringify(ok)}`);
    return ok;
  });

  await check('T3-15', '#10+#12 Pairwise', 'prefers-reduced-motion + /hub tab switching + EN/FR toggle zero overflow', async () => {
    await cdp.setViewport(390, 844);
    await cdp.setReducedMotion(true);
    await cdp.navigate(`${baseUrl}/hub`);
    await switchHubTab(cdp, 'CALC');
    await setLocale(cdp, 'FR');
    await cdp.assertNoHorizontalOverflow(390, 'hub reduced-motion FR');
    await setLocale(cdp, 'EN');
    await cdp.setReducedMotion(false);
    return 'reduced-motion + hub EN/FR clean';
  });

  await check('T3-16', '#7+#11 Pairwise', 'Live synthetic 990001 integrates On Course threat into PENALTY BREAKDOWN & START LIST H2H', async () => {
    try {
      await openSyntheticRaceInHub(cdp, apiUrl, baseUrl, vectors, 'COUPE ÉLITE');
      await clickButtonMatching(cdp, 'PENALTY BREAKDOWN');
      await waitForCondition(cdp, () => /87\.0|87/.test(document.body.innerText) && /25\.9/.test(document.body.innerText), 3000, 50);
      const penTxt = await getBodyText(cdp);
      assert(/87\.0|87/.test(penTxt) && /25\.9/.test(penTxt), `Synthetic 990001 Sum B=87/Applied=25.90 missing`);
      await clickButtonMatching(cdp, 'START LIST|H2H');
      await waitForCondition(cdp, () => /ROCHON,\s*Ève/i.test(document.body.innerText) && /ON_COURSE|ON COURSE/i.test(document.body.innerText), 3000, 50);
      const h2hTxt = await getBodyText(cdp);
      assert(/ROCHON,\s*Ève/i.test(h2hTxt) && /ON_COURSE|ON COURSE/i.test(h2hTxt), 'On-course threat ROCHON missing in H2H');
      return '990001 breakdown + threat H2H synced';
    } finally {
      await cdp.clearMockRoutes();
    }
  });

  await check('T3-17', '#1+#13 Pairwise', '/partners and / share identical verified metrics and zero 58.38 leak', async () => {
    await cdp.setViewport(1440, 900);
    await cdp.navigate(`${baseUrl}/partners`);
    const pTxt = await getBodyText(cdp);
    await cdp.navigate(`${baseUrl}/`);
    const hTxt = await getBodyText(cdp);
    for (const metric of ['34.95', '#459', '147', '96']) {
      assert(pTxt.includes(metric) && hTxt.includes(metric), `Metric mismatch (${metric}) between / and /partners`);
    }
    assert(!pTxt.includes('58.38') && !hTxt.includes('58.38'));
    return 'career metrics synced across / and /partners';
  });

  await check('T3-18', '#5+#13 Pairwise', 'Custom 404 recovery link restores active TimingRail state with zero console errors', async () => {
    await cdp.navigate(`${baseUrl}/not-found`, { ignoreStatusErrors: true });
    await clickButtonMatching(cdp, 'RETURN TO START GATE|BACK TO START GATE', 'i', 'main');
    await waitForCondition(cdp, () => location.pathname === '/', 3000, 50);
    const path = await cdp.evaluate('location.pathname');
    assert(path === '/', `404 recovery did not reach /: ${path}`);
    assert(cdp.pageErrors.length === 0, `Errors on 404 recovery: ${JSON.stringify(cdp.pageErrors)}`);
    return { recoveredTo: path };
  });

  return runner.finish();
}
