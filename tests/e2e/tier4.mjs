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

export async function runTier4(ctx) {
  const { cdp, baseUrl, apiUrl, filterRegex } = ctx;
  const vectors = loadExpectedVectors();
  const runner = createTierRunner('tier4', filterRegex);
  const { check } = runner;

  await check('T4-WF-01', 'Workflow 1', 'Race-day mobile coach workflow (390x844 /hub: filter -> 309223 -> penalty -> target -> 58.38 sim -> scout 6100596)', async () => {
    await cdp.setViewport(390, 844);
    await cdp.setReducedMotion(false);
    await cdp.navigate(`${baseUrl}/hub`);
    await fillFieldMatching(cdp, 'DATE', '2026-04-11');
    await waitForCondition(cdp, () => /SUPER SERIE|SKIBEC/i.test(document.body.innerText), 4000, 50);
    await clickButtonMatching(cdp, '^FIS$');
    await waitForCondition(cdp, () => /SUPER SERIE|SKIBEC/i.test(document.body.innerText), 3000, 50);
    await clickButtonMatching(cdp, '309223|0484');
    await waitForCondition(cdp, () => /109\.47|1:49\.47/.test(document.body.innerText), 4000, 50);

    // Check penalty and expand Julian
    await fillFieldMatching(cdp, 'SEASON', '2026');
    await waitForCondition(cdp, () => /24\.25/.test(document.body.innerText) && /109\.47|1:49\.47/.test(document.body.innerText), 3000, 50);
    let txt = await getBodyText(cdp);
    assert(/24\.25/.test(txt) && /109\.47|1:49\.47/.test(txt), 'MSA 309223 penalty/leader missing');
    await clickButtonMatching(cdp, 'BRUNET,\\s*Julian');
    await waitForCondition(cdp, () => /Target Time|CALC TARGET/i.test(document.body.innerText), 3000, 50);
    await clickButtonMatching(cdp, 'Target Time|CALC TARGET');
    await waitForCondition(cdp, () => /1:50\.63|110\.63/.test(document.body.innerText) && /53\.67/.test(document.body.innerText), 3000, 50);

    txt = await getBodyText(cdp);
    assert(/1:50\.63|110\.63/.test(txt) && /53\.67/.test(txt), 'Target time calculation failed');

    // Run Next-List 58.38 sim
    await fillFieldMatching(cdp, '^Discipline$', 'GS', 'i', '#sim-form').catch(() =>
      fillFieldMatching(cdp, 'Sim Discipline|^Discipline$', 'GS', 'i', '#sim-form')
    );
    await fillFieldMatching(cdp, '^Season$', '2027', 'i', '#sim-form').catch(() =>
      fillFieldMatching(cdp, 'Sim Season|^Season$', '2027', 'i', '#sim-form')
    );
    await fillFieldMatching(cdp, 'Race Scores|^Results$', '42.95, 54.35', 'i', '#sim-form');
    await clickButtonMatching(cdp, 'SIMULATE LIST');
    await waitForCondition(cdp, () => /58\.38/.test(document.body.innerText), 3000, 50);
    txt = await getBodyText(cdp);
    assert(/58\.38/.test(txt), 'Next-List 58.38 sim failed');

    // Scout 6100596
    await switchHubTab(cdp, 'ATHLETES');
    await fillFieldMatching(cdp, 'Search FIS|FIS code', '6100596');
    await clickButtonMatching(cdp, 'SEARCH ATHLETE|^SEARCH$');
    await waitForCondition(cdp, () => /BRUNET/i.test(document.body.innerText), 3000, 50);
    await clickButtonMatching(cdp, 'BRUNET');
    await waitForCondition(cdp, () => /58\.38/.test(document.body.innerText) && /93\.52/.test(document.body.innerText), 3000, 50);
    txt = await getBodyText(cdp);
    assert(/BRUNET/i.test(txt) && /58\.38/.test(txt) && /93\.52/.test(txt), 'Scout 6100596 failed');
    await cdp.assertNoHorizontalOverflow(390, 'Workflow 1 end');
    return 'Workflow 1 complete';
  });

  await check('T4-WF-02', 'Workflow 2', 'Desktop portfolio descent (1440x900 /: hero -> GATE 01 -> Gates 01-08 -> EN/FR -> /partners)', async () => {
    await cdp.setViewport(1440, 900);
    await cdp.navigate(`${baseUrl}/`);
    assert((await getBodyText(cdp)).includes('JULIAN'), 'Hero missing');
    await clickButtonMatching(cdp, 'GATE 01');
    await waitForCondition(cdp, () => window.scrollY > 200, 3000, 50);
    assert((await cdp.evaluate('window.scrollY')) > 200, 'GATE 01 jump failed');
    await waitForCondition(
      cdp,
      () => {
        const y = window.scrollY;
        const prev = window.__lastScrollY ?? -1;
        window.__lastScrollY = y;
        return prev >= 0 && Math.abs(y - prev) < 1;
      },
      2500,
      150
    );

    for (const num of ['01', '04', '07', '08']) {
      await cdp.callFn((n) => {
        const el =
          document.querySelector(`#gate-${n}, [data-gate="${n}"]`) ||
          Array.from(document.querySelectorAll('article, [data-gate]')).find((e) => e.innerText.includes('GATE ' + n));
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - Math.round(window.innerHeight * 0.35), behavior: 'instant' });
        window.dispatchEvent(new Event('scroll'));
      }, num);
      await new Promise((r) => setTimeout(r, 80));
    }
    await waitForCondition(
      cdp,
      () => {
        const bay = document.querySelector('#contextual-bay, .telemetry-bay, aside.split-board-col, aside.split-board, #course-gates aside');
        return Boolean(bay && /147|96|8\s+first-year/i.test(bay.innerText));
      },
      3000,
      50
    );
    const bayText = await cdp.evaluate(`document.querySelector('#contextual-bay, .telemetry-bay, aside.split-board-col, aside.split-board, #course-gates aside')?.innerText || ''`);
    assert(/147|96|8\s+first-year/i.test(bayText), `Gate 08 bay missing after descent: ${bayText}`);

    await setLocale(cdp, 'FR');
    assert(/147\s+INSCRIPTIONS/i.test(await getBodyText(cdp)), 'FR toggle failed');
    await setLocale(cdp, 'EN');

    await clickButtonMatching(cdp, 'PARTNERS');
    await waitForCondition(cdp, () => location.pathname === '/partners', 3000, 50);
    const pTxt = await getBodyText(cdp);
    assert((await cdp.evaluate('location.pathname')) === '/partners' && pTxt.includes('34.95') && !pTxt.includes('58.38'));
    return 'Workflow 2 complete';
  });

  await check('T4-WF-03', 'Workflow 3', 'Recorded MSA 309223 browser + API numerical parity (To=109.47, Pen=24.25, Julian 110.63/10.70/34.95, FIS 130671)', async () => {
    const live = await apiJson(apiUrl, '/races/309223/live?season=2026&category=FIS');
    const fis = await apiJson(apiUrl, '/fis/race/130671');
    assert(live.status === 200 && fis.status === 200);
    assert(live.json.leader_time_ms === 109470);
    assertClose2(live.json.penalty.applied_penalty, 24.25, '309223 Pen');
    const j = live.json.racers.find((r) => String(r.fis_code) === '6100596');
    assert(j.total_ms === 110630);
    assertClose2(j.race_points, 10.70, 'Julian P');
    assertClose2(j.expected_fis_points, 34.95, 'Julian Total');
    const jFis = fis.json.results.find((r) => String(r.fis_code) === '6100596');
    assertClose2(jFis.fis_points, 34.95, '130671 Julian');

    await cdp.setViewport(1440, 900);
    await cdp.navigate(`${baseUrl}/hub`);
    await fillFieldMatching(cdp, 'DATE', '2026-04-11');
    await waitForCondition(cdp, () => /SUPER SERIE|SKIBEC/i.test(document.body.innerText), 4000, 50);
    await clickButtonMatching(cdp, '309223|0484');
    await waitForCondition(cdp, () => /109\.47|1:49\.47/.test(document.body.innerText), 4000, 50);
    await fillFieldMatching(cdp, 'SEASON', '2026');
    await waitForCondition(cdp, () => /24\.25/.test(document.body.innerText) && /34\.95/.test(document.body.innerText), 3000, 50);
    const uiTxt = await getBodyText(cdp);
    assert(/109\.47|1:49\.47/.test(uiTxt) && /24\.25/.test(uiTxt) && /1:50\.63/.test(uiTxt) && /34\.95/.test(uiTxt));
    return 'Workflow 3 parity confirmed';
  });

  await check('T4-WF-04', 'Workflow 4', '2026/27 +8.00 Adder + On Course live sentinel + hHT restriction workflow in /hub UI', async () => {
    await cdp.setViewport(390, 844);
    try {
      await openSyntheticRaceInHub(cdp, apiUrl, baseUrl, vectors, 'COUPE ÉLITE');
      let txt = await getBodyText(cdp);
      assert(/25\.90/.test(txt) && /\+8/.test(txt) && /On Course/i.test(txt) && !/2147483500/.test(txt), '990001 live UI invalid');

      await switchHubTab(cdp, 'LIVE');
      await clickButtonMatching(cdp, 'RESORT RESTRICTED RUN 2');
      await waitForCondition(cdp, () => /restricted|hidden|hHT=1/i.test(document.body.innerText), 3000, 50);
      txt = await getBodyText(cdp);
      assert(/restricted|hidden|hHT=1/i.test(txt) && !/1:44\.00/.test(txt), 'hHT=1 UI check failed');

      await switchHubTab(cdp, 'LIVE');
      await clickButtonMatching(cdp, 'RESORT RESTRICTED ALL');
      await waitForCondition(cdp, () => /restricted|hidden|hHT=2/i.test(document.body.innerText), 3000, 50);
      txt = await getBodyText(cdp);
      assert(/restricted|hidden|hHT=2/i.test(txt) && !/1:32\.00/.test(txt), 'hHT=2 UI check failed');
      return 'Workflow 4 complete';
    } finally {
      await cdp.clearMockRoutes();
    }
  });

  await check('T4-WF-05', 'Workflow 5', 'Mobile / + cross-route /hub -> /partners -> /not-found -> /#course-gates recovery (390x844)', async () => {
    await cdp.setViewport(390, 844);
    await cdp.navigate(`${baseUrl}/`);
    await cdp.assertNoHorizontalOverflow(390, 'WF5 /');

    await clickButtonMatching(cdp, 'MENU|OPEN NAVIGATION|NAVIGATION');
    await clickButtonMatching(cdp, 'TIMING\\s+HUB|\\bHUB\\b');
    await waitForCondition(cdp, () => location.pathname === '/hub', 3000, 50);
    assert((await cdp.evaluate('location.pathname')) === '/hub');
    await cdp.assertNoHorizontalOverflow(390, 'WF5 /hub');

    await clickButtonMatching(cdp, 'MENU|OPEN NAVIGATION|NAVIGATION');
    await clickButtonMatching(cdp, 'PARTNERS');
    await waitForCondition(cdp, () => location.pathname === '/partners', 3000, 50);
    assert((await cdp.evaluate('location.pathname')) === '/partners');
    await cdp.assertNoHorizontalOverflow(390, 'WF5 /partners');

    const nav404 = await cdp.navigate(`${baseUrl}/not-found`, { ignoreStatusErrors: true });
    assert(nav404.documentStatus === 404);
    await clickButtonMatching(cdp, 'RETURN TO START GATE|BACK TO START GATE', 'i', 'main');
    await waitForCondition(cdp, () => location.pathname === '/', 3000, 50);
    assert((await cdp.evaluate('location.pathname')) === '/');
    return 'Workflow 5 complete';
  });

  await check('T4-WF-06', 'Workflow 6', 'Inactive athlete 6100596 scouting + Season 2027 Best-3 GS vs Best-2 SG planning workflow', async () => {
    await cdp.setViewport(1440, 900);
    await cdp.navigate(`${baseUrl}/hub`);
    await switchHubTab(cdp, 'ATHLETES');
    await fillFieldMatching(cdp, 'Search FIS|FIS code', '6100596');
    await clickButtonMatching(cdp, 'SEARCH ATHLETE|^SEARCH$');
    await waitForCondition(cdp, () => /BRUNET/i.test(document.body.innerText), 3000, 50);
    await clickButtonMatching(cdp, 'BRUNET');
    await waitForCondition(cdp, () => /58\.38/.test(document.body.innerText) && /135\.54/.test(document.body.innerText), 3000, 50);
    const athTxt = await getBodyText(cdp);
    assert(/58\.38/.test(athTxt) && /135\.54/.test(athTxt) && /Not active|NOT ACTIVE|INACTIVE/i.test(athTxt));

    await switchHubTab(cdp, 'CALC');
    await fillFieldMatching(cdp, '^Discipline$', 'GS', 'i', '#sim-form').catch(() =>
      fillFieldMatching(cdp, 'Sim Discipline|^Discipline$', 'GS', 'i', '#sim-form')
    );
    await fillFieldMatching(cdp, '^Season$', '2027', 'i', '#sim-form').catch(() =>
      fillFieldMatching(cdp, 'Sim Season|^Season$', '2027', 'i', '#sim-form')
    );
    await fillFieldMatching(cdp, 'Race Scores|^Results$', '34.95, 36.12, 37.00, 46.35', 'i', '#sim-form');
    await clickButtonMatching(cdp, 'SIMULATE LIST');
    await waitForCondition(cdp, () => /36\.02/.test(document.body.innerText), 3000, 50);
    assert(/36\.02/.test(await getBodyText(cdp)), 'GS Best-3 planning sim failed (expected 36.02)');

    await fillFieldMatching(cdp, '^Discipline$', 'SG', 'i', '#sim-form').catch(() =>
      fillFieldMatching(cdp, 'Sim Discipline|^Discipline$', 'SG', 'i', '#sim-form')
    );
    await fillFieldMatching(cdp, 'Race Scores|^Results$', '85.50', 'i', '#sim-form');
    await clickButtonMatching(cdp, 'SIMULATE LIST');
    await waitForCondition(cdp, () => /102\.60/.test(document.body.innerText), 3000, 50);
    assert(/102\.60/.test(await getBodyText(cdp)), 'SG Best-2 planning sim failed (expected 102.60)');
    return 'Workflow 6 complete';
  });

  await check('T4-WF-07', 'Workflow 7', 'Empty race day (1999-07-15) graceful recovery to 2026-04-11 MSA 309223', async () => {
    await cdp.setViewport(390, 844);
    await cdp.navigate(`${baseUrl}/hub`);
    await fillFieldMatching(cdp, 'DATE', '1999-07-15');
    await waitForCondition(cdp, () => /NO RACES|AUCUNE COURSE/i.test(document.body.innerText), 4000, 50);
    assert(/NO RACES|AUCUNE COURSE/i.test(await getBodyText(cdp)), 'Missing empty day message');
    await fillFieldMatching(cdp, 'DATE', '2026-04-11');
    await waitForCondition(cdp, () => /SUPER SERIE|SKIBEC/i.test(document.body.innerText), 4000, 50);
    await clickButtonMatching(cdp, '309223|0484');
    await waitForCondition(cdp, () => /109\.47|1:49\.47/.test(document.body.innerText), 4000, 50);
    assert(/109\.47|1:49\.47/.test(await getBodyText(cdp)), 'Failed recovering from empty day to 309223');
    return 'Workflow 7 complete';
  });

  await check('T4-WF-08', 'Workflow 8', 'Keyboard-only (Tab, Enter, Space, Escape) + reduced-motion accessibility journey across / and /hub', async () => {
    await cdp.setViewport(390, 844);
    await cdp.setReducedMotion(true);
    await cdp.navigate(`${baseUrl}/`);

    // Keyboard open & Escape close mobile drawer
    await cdp.evaluate(`document.querySelector('.menu-toggle, [aria-expanded]')?.focus()`);
    await cdp.pressKey('Enter');
    assert((await cdp.evaluate(`document.querySelector('[aria-expanded]')?.getAttribute('aria-expanded')`)) === 'true', 'Enter did not open menu');
    await cdp.pressKey('Escape');
    assert((await cdp.evaluate(`document.querySelector('[aria-expanded]')?.getAttribute('aria-expanded')`)) === 'false', 'Escape did not close menu');

    // Desktop curve keyboard Tab/Space
    await cdp.setViewport(1440, 900);
    await cdp.evaluate(`document.querySelector('aside.split-board-col svg [role="button"], aside.split-board svg [role="button"], #split-curve-svg [role="button"], aside svg [role="button"], aside svg [tabindex="0"]')?.focus()`);
    const before = await cdp.evaluate(`document.querySelector('#curve-readout, aside.split-board-col #curve-readout, aside.split-board #curve-readout')?.innerText || ''`);
    await cdp.pressKey('Space');
    await cdp.pressKey('Tab');
    await cdp.pressKey('Enter');
    const after = await cdp.evaluate(`document.querySelector('#curve-readout, aside.split-board-col #curve-readout, aside.split-board #curve-readout')?.innerText || ''`);
    assert(before !== after, `Keyboard Tab+Enter on curve did not advance readout (${before} === ${after})`);

    // Keyboard tab switch on /hub
    await cdp.navigate(`${baseUrl}/hub`);
    await cdp.evaluate(`document.querySelectorAll('[role="tab"]')[2]?.focus()`);
    await cdp.pressKey('Enter');
    await waitForCondition(cdp, () => /CALC|CALCUL/i.test(document.querySelector('[role="tab"][aria-selected="true"]')?.innerText || ''), 3000, 50);
    const sel = await cdp.evaluate(`document.querySelector('[role="tab"][aria-selected="true"]')?.innerText || ''`);
    await cdp.setReducedMotion(false);
    assert(/CALC|CALCUL/i.test(sel), `Enter on CALC tab failed: ${sel}`);
    return 'Workflow 8 complete';
  });

  await check('T4-WF-09', 'Workflow 9', '2026/27 FIS official race parity (132230 clamped 23.00, 132229 32.42, 131463 double-max 330.00)', async () => {
    const r30 = await apiJson(apiUrl, '/fis/race/132230');
    const r29 = await apiJson(apiUrl, '/fis/race/132229');
    const r63 = await apiJson(apiUrl, '/fis/race/131463');
    assert(r30.status === 200 && r29.status === 200 && r63.status === 200);
    assertClose2(r30.json.applied_penalty, 23.0, '132230');
    assertClose2(r29.json.applied_penalty, 32.42, '132229');
    assertClose2(r63.json.applied_penalty, 330.0, '131463');
    return { p132230: 23.0, p132229: 32.42, p131463: 330.0 };
  });

  await check('T4-WF-10', 'Workflow 10', 'Zero uncaught exceptions, zero HTTP 5xx, zero failed local requests, and < 10% accent across complete route tour', async () => {
    await cdp.setViewport(1440, 900);
    for (const p of ['/', '/hub', '/partners']) {
      await cdp.navigate(`${baseUrl}${p}`);
      assert(cdp.pageErrors.length === 0, `Page errors on ${p}: ${JSON.stringify(cdp.pageErrors)}`);
      const localFailures = cdp.requestFailures.filter((f) => {
        const u = String(f.url || '');
        return !/^https:\/\/fonts\.(googleapis|gstatic)\.com\//i.test(u);
      });
      assert(localFailures.length === 0, `Request failures on ${p}: ${JSON.stringify(localFailures)}`);
      assert(cdp.getUnexpected404s().length === 0, `Unexpected 404s on ${p}: ${JSON.stringify(cdp.getUnexpected404s())}`);
      const bad500 = cdp.networkResponses.filter((r) => r.status >= 500);
      assert(bad500.length === 0, `HTTP 5xx on ${p}: ${JSON.stringify(bad500)}`);
      const px = await cdp.measureAccentRatio();
      assert(px.accentPct < 10.0, `Accent > 10% on ${p}: ${px.accentPct}%`);
    }
    return 'holistic clean tour complete';
  });

  return runner.finish();
}
