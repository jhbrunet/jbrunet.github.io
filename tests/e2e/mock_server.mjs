import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const VECTORS = JSON.parse(
  fs.readFileSync(path.join(FIXTURES_DIR, 'expected_vectors.json'), 'utf8')
);

function loadFontBytes(kind) {
  const candidates = {
    display: [
      '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
      '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    ],
    body: [
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    ],
    mono: [
      '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
      '/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf',
    ],
  }[kind];
  for (const p of candidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p);
  }
  return Buffer.alloc(0);
}

const FONT_BYTES = {
  display: loadFontBytes('display'),
  body: loadFontBytes('body'),
  mono: loadFontBytes('mono'),
};

// Exact BigInt scaled decimal helpers (2 decimal places = cents)
function toCents(val) {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val).trim();
  const m = s.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!m) throw new Error(`Invalid decimal: ${val}`);
  const neg = m[1] === '-';
  const whole = BigInt(m[2]);
  const fracRaw = (m[3] || '').padEnd(3, '0');
  let cents = whole * 100n + BigInt(fracRaw.slice(0, 2));
  if (fracRaw.length > 2 && Number(fracRaw[2]) >= 5) {
    // Round half-up on third decimal digit if input already had >2 decimals
    cents += 1n;
  }
  return neg ? -cents : cents;
}

function centsToNum(c) {
  return Number((Number(c) / 100).toFixed(2));
}

function divHalfUp(numer, denom) {
  if (denom <= 0n) throw new Error('denom must be positive');
  if (numer >= 0n) {
    return (numer * 2n + denom) / (2n * denom);
  }
  return -(((-numer) * 2n + denom) / (2n * denom));
}

function formatTimeMs(ms) {
  const totalCs = Math.round(ms / 10);
  const cs = totalCs % 100;
  const totalS = Math.floor(totalCs / 100);
  const s = totalS % 60;
  const m = Math.floor(totalS / 60);
  if (m > 0) {
    return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  }
  return `${s}.${String(cs).padStart(2, '0')}`;
}

function parseBinLines(file) {
  const raw = fs.readFileSync(path.join(FIXTURES_DIR, file));
  return raw.toString('latin1').split(/\r?\n/).filter(Boolean);
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseAjRaceString(rawStr) {
  const lines = rawStr.split(/\r?\n/).filter(Boolean);
  const hdrParts = (lines[0] || '').split('|');
  const hdr = {};
  for (const part of hdrParts) {
    const eq = part.indexOf('=');
    if (eq > 0) hdr[part.slice(0, eq)] = part.slice(eq + 1);
  }
  const racers = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = {};
    for (const part of lines[i].split('|')) {
      const eq = part.indexOf('=');
      if (eq > 0) fields[part.slice(0, eq)] = part.slice(eq + 1);
    }
    if (fields.b) racers.push(fields);
  }
  return { hdr, racers };
}

function parseAjRaceBin(file, { corruptMojibake = false } = {}) {
  const buf = fs.readFileSync(path.join(FIXTURES_DIR, file));
  const rawStr = corruptMojibake ? buf.toString('utf8') : decodeHtmlEntities(buf.toString('latin1'));
  return parseAjRaceString(rawStr);
}

const INLINE_309519_BIN = [
  '1=0=794866800.00000=N=30|clearC|hNR=0|hN=U=AURORA CUP|hT=Slalom=Women|hC=CAN=AB|hR=Nakiska|hST=11/15/2026 9:30 AM|hM=|hHT=0|hID=309519|hFCODE=5440|hE|',
  'b=1|m=JAKOBSEN, Kristoffer|nat=SWE|fn=502015|fp=99999|r1=43.00=43000|r2=43.00=43000|tt=1:26.00|tm=86000|p=1|',
  'b=2|m=ST-GERMAIN, William|nat=CAN|fn=103857|fp=99999|r1=43.50=43500|r2=43.50=43500|tt=1:27.00|tm=87000|p=2|',
  'b=3|m=JUNIOR, Unranked|nat=CAN|fn=109237|fp=99999|r1=44.00=44000|r2=44.00=44000|tt=1:28.00|tm=88000|p=3|',
  'b=4|m=SEEDED, Four|nat=CAN|fn=109270|fp=3500|r1=44.50=44500|r2=44.50=44500|tt=1:29.00|tm=89000|p=4|',
  'b=5|m=SEEDED, Five|nat=USA|fn=109269|fp=4000|r1=45.00=45000|r2=45.00=45000|tt=1:30.00|tm=90000|p=5|',
  'b=6|m=SENTINEL, Dnf1|nat=CAN|fn=109271|fp=2800|r1=DNF=2147483602|r2=DNS=2147483607|',
  'b=7|m=SENTINEL, Dqg42|nat=CAN|fn=109272|fp=2900|r1=DQg42=2147483627|r2=DNS=2147483607|',
  'b=8|m=SENTINEL, Dns1|nat=CAN|fn=109273|fp=1200|r1=DNS=2147483607|r2=DNS=2147483607|',
].join('\n');

function buildLivePayloadFromBin(ltId, { season = 2027, category = 'FIS', mutant = null } = {}) {
  const fileMap = {
    '309223': 'aj_race_309223_snapshot.bin',
    '300126': 'aj_race_300126_snapshot.bin',
    '990001': 'aj_race_990001_sentinels.bin',
    '990002': 'aj_race_990002_hnr3.bin',
    '990003': 'aj_race_990003_hht1.bin',
    '990004': 'aj_race_990004_hht2.bin',
    '990005': 'aj_race_990005_tiebreak.bin',
  };
  let parsed;
  if (ltId === '309519') {
    parsed = parseAjRaceString(INLINE_309519_BIN);
  } else {
    const file = fileMap[ltId];
    if (!file) return null;
    parsed = parseAjRaceBin(file, {
      corruptMojibake: mutant === 'mojibake' && ltId === '990001',
    });
  }
  const { hdr, racers: rawRows } = parsed;
  const [discLabel, genderLabel] = (hdr.hT || 'Slalom=Men').split('=');
  const discMap = { Slalom: 'SL', 'Giant Slalom': 'GS', 'Super-G': 'SG', Downhill: 'DH', Combined: 'AC' };
  const disc = discMap[discLabel] || 'SL';
  const discMeta = VECTORS.disciplines[disc];
  const catMeta = VECTORS.categories[category] || VECTORS.categories.FIS;
  const hNR = Number(hdr.hNR || '0');
  const numRuns = disc === 'DH' || disc === 'SG' ? 1 : hNR === 3 ? 3 : 2;
  const hHT = hdr.hHT || '0';
  const headerParts = (hdr['1'] || '').split('=');
  const serverStamp = headerParts[1] || '794866900.00000';
  const online = (hdr['1'] || '').includes('=Y=') || ltId === '990001';
  const refreshSeconds = online ? 5 : 30;

  const parseRunField = (val) => {
    if (!val) return { display: null, ms: null, code: null };
    const idx = val.lastIndexOf('=');
    if (idx < 0) return { display: val, ms: null, code: null };
    const display = val.slice(0, idx);
    const num = Number(val.slice(idx + 1));
    return { display, ms: num < 2147483500 ? num : null, rawCode: num };
  };

  let racers = rawRows.map((row) => {
    const r1 = parseRunField(row.r1);
    const r2 = parseRunField(row.r2);
    const r3 = parseRunField(row.r3);
    const rawFpNum = row.fp ? Number(row.fp) : null;
    let fpCents = rawFpNum !== null && Number.isFinite(rawFpNum) && rawFpNum > 0 && rawFpNum < 99999 ? BigInt(row.fp) : null;
    let pointsEnriched = false;
    if (fpCents === null && row.fn) {
      const ath = Object.values(VECTORS.athletes).find(
        (a) => a.active && String(a.fis_code) === String(row.fn)
      );
      const pts = ath?.points?.[disc];
      if (typeof pts === 'number' && Number.isFinite(pts)) {
        fpCents = toCents(pts);
        pointsEnriched = true;
      }
    }
    const isOnCourse = r1.rawCode === 2147483500 || r2.rawCode === 2147483500 || r3.rawCode === 2147483500;

    let status = 'QLF';
    let totalMs = null;
    let totalDisplay = row.tt || null;

    if (isOnCourse) {
      status = 'ON_COURSE';
      totalMs = mutant === 'on-course-time' ? 2147483500 : null;
      totalDisplay = mutant === 'on-course-time' ? '2147483.50' : 'On Course';
    } else if (r1.rawCode === 2147483607) {
      status = 'DNS1';
      totalDisplay = 'DNS';
    } else if (r1.rawCode === 2147483602) {
      status = 'DNF1';
      totalDisplay = 'DNF';
    } else if (r1.rawCode === 2147483627) {
      status = r1.display || 'DSQ';
      totalDisplay = r1.display || 'DSQ';
    } else if (numRuns === 1 && r1.ms !== null) {
      status = 'QLF';
      totalMs = r1.ms;
      totalDisplay = r1.display;
    } else if (numRuns >= 2 && r2.rawCode === 2147483607) {
      status = 'DNS2';
      totalDisplay = 'DNS2';
    } else if (numRuns >= 2 && r2.rawCode === 2147483617) {
      status = 'DNF2';
      totalDisplay = 'DNF2';
    } else if (numRuns >= 2 && r2.rawCode === 2147483627) {
      status = r2.display || 'DSQ';
      totalDisplay = r2.display || 'DSQ';
    } else if (row.tm && Number(row.tm) < 2147483500) {
      status = 'QLF';
      totalMs = Number(row.tm);
    }

    const intermediates_cs = {};
    if (row.i11) {
      const idx = row.i11.lastIndexOf('=');
      intermediates_cs.i11 = Number(row.i11.slice(idx + 1));
    }

    return {
      bib: Number(row.b),
      name: row.m,
      nation: row.nat || 'CAN',
      club: row.club || null,
      category_class: 'SR',
      fis_code: row.fn || null,
      fis_points: fpCents !== null ? centsToNum(fpCents) : null,
      _fpCents: fpCents,
      points_enriched: pointsEnriched,
      r1_display: r1.display,
      r1_ms: r1.ms,
      r2_display: numRuns >= 2 ? r2.display : null,
      r2_ms: numRuns >= 2 ? r2.ms : null,
      r3_display: numRuns === 3 ? r3.display : null,
      r3_ms: numRuns === 3 ? r3.ms : null,
      total_display: totalDisplay,
      total_ms: totalMs,
      rank: row.p ? Number(row.p) : null,
      status,
      is_on_course: isOnCourse,
      elapsed_live_ms: isOnCourse ? 15000 : null,
      intermediates_cs,
      speeds: {},
      race_points: null,
      expected_fis_points: null,
    };
  });

  const finishers = racers
    .filter((r) => (r.status === 'QLF' || r.status === 'FIN') && r.total_ms !== null)
    .sort((a, b) => a.total_ms - b.total_ms);
  const leaderTimeMs = finishers.length > 0 ? finishers[0].total_ms : null;

  const adderCents = season >= 2027 ? toCents(catMeta.adder_2027) : 0n;
  const maxCents = toCents(discMeta.max_points);

  for (const f of finishers) {
    const numer = BigInt(f.total_ms - leaderTimeMs) * BigInt(discMeta.f_value) * 100n;
    const pCents = divHalfUp(numer, BigInt(leaderTimeMs));
    f.race_points = centsToNum(pCents);
    f._racePtsCents = pCents;
  }

  // Penalty calc
  const starters = racers.filter((r) => {
    if (mutant === 'dns1-in-sumb' && r.status === 'DNS1') return true;
    return r.status !== 'DNS1';
  });

  // Top 5 starters (Sum B)
  const bPool = [...starters]
    .map((s) => ({
      ...s,
      effCents: s._fpCents !== null && s._fpCents < maxCents ? s._fpCents : maxCents,
    }))
    .sort((a, b) => (a.effCents < b.effCents ? -1 : a.effCents > b.effCents ? 1 : 0))
    .slice(0, 5);
  const sumBCents = bPool.reduce((acc, s) => acc + s.effCents, 0n);

  // Top 5 in top 10 finishers (Sum A & Sum C), Art. 4.4.6 tie-break chooses HIGHER race_points
  const top10 = finishers.slice(0, 10);
  const aPool = [...top10]
    .map((s) => ({
      ...s,
      effCents: s._fpCents !== null && s._fpCents < maxCents ? s._fpCents : maxCents,
    }))
    .sort((a, b) => {
      if (a.effCents !== b.effCents) return a.effCents < b.effCents ? -1 : 1;
      return (b._racePtsCents || 0n) > (a._racePtsCents || 0n) ? 1 : -1;
    })
    .slice(0, 5);
  const sumACents = aPool.reduce((acc, s) => acc + s.effCents, 0n);
  const sumCCents = aPool.reduce((acc, s) => acc + (s._racePtsCents || 0n), 0n);

  const numerator = sumACents + sumBCents - sumCCents;
  let rawCents;
  if (mutant === 'float-round') {
    rawCents = BigInt(Math.round(Number((Number(numerator) / 1000).toFixed(2)) * 100));
  } else {
    rawCents = divHalfUp(numerator, 10n);
  }

  let appliedCents = rawCents + adderCents;
  const minCents = toCents(catMeta.min);
  const maxCatCents = toCents(catMeta.max);
  let clamped = false;
  if (catMeta.max > 0) {
    if (mutant === 'clamp-before-adder') {
      const pre = rawCents < minCents ? minCents : rawCents;
      if (rawCents < minCents) clamped = true;
      appliedCents = pre + adderCents;
    } else {
      if (appliedCents < minCents) {
        appliedCents = minCents;
        clamped = true;
      } else if (appliedCents > maxCatCents) {
        appliedCents = maxCatCents;
        clamped = true;
      }
    }
  } else {
    appliedCents = 0n;
  }

  for (const f of finishers) {
    f.expected_fis_points = centsToNum(f._racePtsCents + appliedCents);
  }

  // Apply hHT display suppression
  const hideTimesMode = hHT === '2' || hHT === 'Y' ? 2 : hHT === '1' ? 1 : 0;
  let hideNotice = null;
  let suppressedLeader = leaderTimeMs;
  if (hideTimesMode === 1) {
    hideNotice = 'Resort restriction active (hHT=1): Run 2 and combined totals hidden.';
    suppressedLeader = null;
    racers = racers.map((r) => ({
      ...r,
      r2_display: null,
      r2_ms: null,
      r3_display: null,
      r3_ms: null,
      total_display: null,
      total_ms: null,
      rank: null,
      race_points: null,
      expected_fis_points: null,
    }));
  } else if (hideTimesMode === 2) {
    hideNotice = 'Resort restriction active (hHT=2): All times and ranks hidden.';
    suppressedLeader = null;
    racers = racers.map((r) => ({
      ...r,
      r1_display: null,
      r1_ms: null,
      r2_display: null,
      r2_ms: null,
      r3_display: null,
      r3_ms: null,
      total_display: null,
      total_ms: null,
      rank: null,
      race_points: null,
      expected_fis_points: null,
    }));
  }

  // Clean private fields
  racers = racers.map(({ _fpCents, _racePtsCents, ...rest }) => rest);

  // Override exact real snapshot totals for 309223 (123 finishers / 131 starters across full race)
  const is309223 = ltId === '309223';
  const finCount = is309223 ? 123 : finishers.length;
  const startCount = is309223 ? 131 : starters.length;
  const srcType = (hdr.hN || 'U=RACE').split('=')[0] || 'U';

  return {
    lt_id: ltId,
    source_type: srcType,
    server_stamp: serverStamp,
    requested_m: 0,
    online,
    is_delta: false,
    refresh_seconds: refreshSeconds,
    num_runs: numRuns,
    hide_times_mode: hideTimesMode,
    restriction_notice: hideNotice,
    race: {
      name: (hdr.hN || 'U=RACE').split('=').slice(1).join('='),
      discipline: disc,
      discipline_code: disc,
      gender: genderLabel === 'Women' ? 'W' : 'M',
      resort: hdr.hR || 'Mont Garceau',
      start_time: hdr.hST || '',
      fis_codex: ltId === '309223' ? '0484' : hdr.hFCODE || '',
      category,
      season,
      f_value: discMeta.f_value,
      max_points: discMeta.max_points,
      adder: centsToNum(adderCents),
      z_value: 0.0,
      source_type: srcType,
    },
    penalty: {
      status: hideTimesMode === 0 ? (online ? 'PROVISIONAL' : 'OFFICIAL') : 'HIDDEN',
      provisional_calc: hideTimesMode === 0 ? centsToNum(appliedCents) : null,
      raw_calc: hideTimesMode === 0 ? centsToNum(rawCents) : null,
      adder: centsToNum(adderCents),
      z_value: 0.0,
      applied_penalty: hideTimesMode === 0 ? centsToNum(appliedCents) : null,
      category_min: catMeta.min,
      category_max: catMeta.max,
      clamped,
      double_max_triggered: false,
      sum_a: hideTimesMode === 0 ? centsToNum(sumACents) : null,
      sum_b: hideTimesMode === 0 ? centsToNum(sumBCents) : null,
      sum_c: hideTimesMode === 0 ? centsToNum(sumCCents) : null,
      a_pool: aPool.map((p) => ({
        bib: p.bib,
        name: p.name,
        fis_points: p.fis_points,
        race_points: p.race_points,
      })),
      b_pool: bPool.map((p) => ({
        bib: p.bib,
        name: p.name,
        fis_points: p.fis_points,
        status: p.status,
      })),
      finishers_count: finCount,
      starters_count: startCount,
      confidence_note:
        hideNotice ||
        `${finCount} finishers / ${startCount} starters`,
      threats: racers
        .filter((r) => r.is_on_course)
        .map((r) => ({ bib: r.bib, name: r.name, fis_points: r.fis_points, status: r.status })),
    },
    leader_time_ms: suppressedLeader,
    leader_time_display: suppressedLeader ? formatTimeMs(suppressedLeader) : null,
    racers,
  };
}

function handleCalcPenalty(body, mutant) {
  const disc = (body.discipline || 'GS').toUpperCase();
  const discMeta = VECTORS.disciplines[disc];
  if (!discMeta) return { status: 422, json: { detail: `Unknown discipline: ${disc}` } };
  const gender = (body.gender || 'M').toUpperCase();
  const category = (body.category || 'FIS').toUpperCase();
  const catMeta = VECTORS.categories[category] || VECTORS.categories.FIS;
  const season = Number(body.season ?? 2027);
  const adderCents = season >= 2027 ? toCents(catMeta.adder_2027) : 0n;
  const maxCents = toCents(discMeta.max_points);
  const doubleMaxCents = toCents(discMeta.double_max);

  let sumACents = 0n;
  let sumBCents = 0n;
  let sumCCents = 0n;
  let doubleMaxTriggered = false;
  let leaderMs = null;
  let finishersCount = 5;
  let startersCount = 5;
  let fisFinishersTop10 = 5;
  let fisStartersCount = 5;

  const hasCompetitors = Array.isArray(body.competitors);
  const hasFinishers = Array.isArray(body.finishers);

  if (hasCompetitors || hasFinishers) {
    let rawFinishers = [];
    let rawStarters = [];

    if (hasCompetitors) {
      const comps = body.competitors.map((c, idx) => {
        const st = String(c.status || 'QLF').toUpperCase();
        const tMs = c.total_ms ?? c.time_ms ?? (c.time_s ? Math.round(Number(c.time_s) * 1000) : null);
        return {
          ...c,
          idx,
          status: st,
          time_ms: tMs !== null && tMs !== undefined ? Number(tMs) : null,
          list_points: c.list_points ?? c.fis_points ?? null,
        };
      });
      rawFinishers = comps
        .filter((c) => (c.status === 'QLF' || c.status === 'FIN') && c.time_ms !== null && c.time_ms > 0)
        .sort((a, b) => a.time_ms - b.time_ms);
      rawStarters = comps.filter((c) => c.status !== 'DNS1' || mutant === 'dns1-in-sumb');
    } else {
      rawFinishers = body.finishers.map((f, idx) => ({
        ...f,
        idx,
        status: String(f.status || 'QLF').toUpperCase(),
        time_ms: f.total_ms ?? f.time_ms ?? Math.round((f.time_s || 0) * 1000),
      }));
      rawStarters =
        Array.isArray(body.starters) && body.starters.length
          ? body.starters.filter((s) => (s.status || 'QLF') !== 'DNS1' || mutant === 'dns1-in-sumb')
          : rawFinishers;
    }

    finishersCount = rawFinishers.length;
    startersCount = rawStarters.length;

    if (rawFinishers.length < 3) {
      const insuffPen = {
        status: 'INSUFFICIENT_FINISHERS',
        provisional_calc: null,
        raw_calc: null,
        adder: centsToNum(adderCents),
        z_value: 0.0,
        applied_penalty: null,
        category_min: catMeta.min,
        category_max: catMeta.max,
        clamped: false,
        double_max_triggered: false,
        sum_a: 0.0,
        sum_b: 0.0,
        sum_c: 0.0,
        a_pool: [],
        b_pool: [],
        finishers_count: finishersCount,
        starters_count: startersCount,
        fis_finishers_top10_count: 0,
        fis_starters_count: 0,
        confidence_note: 'Minimum 3 classified finishers required for FIS penalty',
        threats: [],
      };
      return {
        status: 200,
        json: {
          discipline: disc,
          gender,
          category,
          season,
          f_value: discMeta.f_value,
          max_points: discMeta.max_points,
          leader_time_ms: rawFinishers[0]?.time_ms ?? null,
          leader_time_display: rawFinishers[0]?.time_ms ? formatTimeMs(rawFinishers[0].time_ms) : null,
          penalty: insuffPen,
          competitor_results: [],
        },
      };
    }

    leaderMs =
      body.leader_time_ms ||
      Math.min(...rawFinishers.map((f) => f.time_ms));
    if (!leaderMs || leaderMs <= 0) {
      return { status: 422, json: { detail: 'Invalid leader time' } };
    }

    const parsedFinishers = rawFinishers.map((f, idx) => {
      const lp = f.list_points !== null && f.list_points !== undefined ? toCents(f.list_points) : null;
      let rpCents;
      if (f.race_points !== undefined && f.race_points !== null) {
        rpCents = toCents(f.race_points);
      } else {
        rpCents = divHalfUp(BigInt(f.time_ms - leaderMs) * BigInt(discMeta.f_value) * 100n, BigInt(leaderMs));
      }
      const hasFisPoints = lp !== null && lp < 99900n;
      const effCents = lp !== null && lp < maxCents ? lp : maxCents;
      return { idx, hasFisPoints, effCents, rpCents };
    });

    const top10Slice = parsedFinishers.slice(0, 10);
    fisFinishersTop10 = top10Slice.filter((f) => f.hasFisPoints).length;
    if (fisFinishersTop10 < 3) {
      doubleMaxTriggered = true;
    }

    const top10 = [...top10Slice];
    while (top10.length < 5) {
      top10.push({ idx: 999, hasFisPoints: false, effCents: maxCents, rpCents: 0n });
    }
    top10.sort((a, b) => {
      if (a.effCents !== b.effCents) return a.effCents < b.effCents ? -1 : 1;
      // Art. 4.4.6 tie-break: higher race_points wins tie
      return b.rpCents > a.rpCents ? 1 : b.rpCents < a.rpCents ? -1 : 0;
    });
    const a5 = top10.slice(0, 5);
    sumACents = a5.reduce((s, x) => s + x.effCents, 0n);
    sumCCents = a5.reduce((s, x) => s + x.rpCents, 0n);

    fisStartersCount = rawStarters.filter((s) => {
      const lp = s.list_points !== null && s.list_points !== undefined ? toCents(s.list_points) : null;
      return lp !== null && lp < 99900n;
    }).length;
    if (fisStartersCount < 3) {
      doubleMaxTriggered = true;
    }

    const bSorted = rawStarters
      .map((s) => {
        const lp = s.list_points !== null && s.list_points !== undefined ? toCents(s.list_points) : null;
        return lp !== null && lp < maxCents ? lp : maxCents;
      })
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    while (bSorted.length < 5) bSorted.push(maxCents);
    sumBCents = bSorted.slice(0, 5).reduce((s, x) => s + x, 0n);
  } else if (body.sum_a !== undefined && body.sum_b !== undefined && body.sum_c !== undefined) {
    sumACents = toCents(body.sum_a);
    sumBCents = toCents(body.sum_b);
    sumCCents = toCents(body.sum_c);
  } else {
    return { status: 422, json: { detail: 'Provide competitors, finishers, or sum_a/sum_b/sum_c' } };
  }

  const numer = sumACents + sumBCents - sumCCents;
  const rawCents =
    mutant === 'float-round'
      ? BigInt(Math.round(Number((Number(numer) / 1000).toFixed(2)) * 100))
      : divHalfUp(numer, 10n);

  const minCents = toCents(catMeta.min);
  const maxCatCents = toCents(catMeta.max);
  let appliedCents;
  let clamped = false;

  if (doubleMaxTriggered) {
    appliedCents = doubleMaxCents;
  } else if (catMeta.max === 0) {
    appliedCents = 0n;
  } else if (mutant === 'clamp-before-adder') {
    const pre = rawCents < minCents ? minCents : rawCents;
    if (rawCents < minCents) clamped = true;
    appliedCents = pre + adderCents;
  } else {
    appliedCents = rawCents + adderCents;
    if (appliedCents < minCents) {
      appliedCents = minCents;
      clamped = true;
    } else if (appliedCents > maxCatCents) {
      appliedCents = maxCatCents;
      clamped = true;
    }
  }

  const penaltyObj = {
    status: body.is_live_in_progress ? 'PROVISIONAL' : 'OFFICIAL',
    provisional_calc: centsToNum(appliedCents),
    raw_calc: centsToNum(rawCents),
    adder: centsToNum(adderCents),
    z_value: 0.0,
    applied_penalty: centsToNum(appliedCents),
    category_min: catMeta.min,
    category_max: catMeta.max,
    clamped,
    double_max_triggered: doubleMaxTriggered,
    sum_a: centsToNum(sumACents),
    sum_b: centsToNum(sumBCents),
    sum_c: centsToNum(sumCCents),
    a_pool: [],
    b_pool: [],
    finishers_count: finishersCount,
    starters_count: startersCount,
    fis_finishers_top10_count: fisFinishersTop10,
    fis_starters_count: fisStartersCount,
    confidence_note: doubleMaxTriggered ? '2xMax floor triggered (<3 FIS holders)' : 'Official penalty calculated',
    threats: [],
  };

  return {
    status: 200,
    json: {
      discipline: disc,
      gender,
      category,
      season,
      f_value: discMeta.f_value,
      max_points: discMeta.max_points,
      leader_time_ms: leaderMs,
      leader_time_display: leaderMs ? formatTimeMs(leaderMs) : null,
      penalty: penaltyObj,
      competitor_results: [],
      sum_a: penaltyObj.sum_a,
      sum_b: penaltyObj.sum_b,
      sum_c: penaltyObj.sum_c,
      raw: penaltyObj.raw_calc,
      adder: penaltyObj.adder,
      applied: penaltyObj.applied_penalty,
      clamped,
      double_max_triggered: doubleMaxTriggered,
      category_min: catMeta.min,
      category_max: catMeta.max,
    },
  };
}

function handleCalcTarget(body) {
  const disc = (body.discipline || 'GS').toUpperCase();
  const discMeta = VECTORS.disciplines[disc];
  if (!discMeta) return { status: 422, json: { detail: `Unknown discipline: ${disc}` } };

  const leaderMs =
    body.leader_time_ms !== undefined
      ? Number(body.leader_time_ms)
      : Math.round(Number(body.leader_time_s || 0) * 1000);
  if (!Number.isFinite(leaderMs) || leaderMs <= 0) {
    return { status: 422, json: { detail: 'leader_time_ms must be > 0' } };
  }

  const penaltyCents = toCents(body.penalty ?? 0);
  const targetCents = toCents(body.target_fis_points);
  if (targetCents === null || penaltyCents === null || penaltyCents < 0n || targetCents < 0n) {
    return { status: 422, json: { detail: 'target_fis_points and penalty must be >= 0' } };
  }

  const run1Ms =
    body.run1_ms !== undefined && body.run1_ms !== null
      ? Number(body.run1_ms)
      : body.run1_s !== undefined && body.run1_s !== null
      ? Math.round(Number(body.run1_s) * 1000)
      : null;

  const pTargetCents = targetCents - penaltyCents;
  if (pTargetCents < 0n) {
    return {
      status: 200,
      json: {
        discipline: disc,
        f_value: discMeta.f_value,
        leader_time_ms: leaderMs,
        leader_time_display: formatTimeMs(leaderMs),
        penalty: centsToNum(penaltyCents),
        target_fis_points: centsToNum(targetCents),
        target_race_points: centsToNum(pTargetCents),
        p_target: centsToNum(pTargetCents),
        achievable: false,
        target_time_ms: null,
        t_target_ms: null,
        target_time_seconds: null,
        t_target_s: null,
        target_time_display: null,
        t_target_formatted: null,
        diff_behind_leader_ms: null,
        diff_behind_leader_display: null,
        diff_behind_leader_s: null,
        run1_ms: run1Ms,
        run2_needed_ms: null,
        run2_needed_seconds: null,
        run2_needed_display: null,
        run2_needed_formatted: null,
      },
    };
  }

  const F = BigInt(discMeta.f_value);
  // T_target in centiseconds = roundHalfUp(leaderMs * (100*F + pTargetCents) / (1000 * F))
  const tTargetCs = divHalfUp(BigInt(leaderMs) * (100n * F + pTargetCents), 1000n * F);
  const tTargetMs = Number(tTargetCs) * 10;
  const diffMs = tTargetMs - leaderMs;

  let run2NeededMs = null;
  let run2NeededSeconds = null;
  let run2NeededFormatted = null;

  if (run1Ms !== null && Number.isFinite(run1Ms) && run1Ms > 0) {
    run2NeededMs = tTargetMs - run1Ms;
    run2NeededSeconds = Number((run2NeededMs / 1000).toFixed(2));
    run2NeededFormatted = formatTimeMs(run2NeededMs);
  }

  return {
    status: 200,
    json: {
      discipline: disc,
      f_value: discMeta.f_value,
      leader_time_ms: leaderMs,
      leader_time_display: formatTimeMs(leaderMs),
      penalty: centsToNum(penaltyCents),
      target_fis_points: centsToNum(targetCents),
      target_race_points: centsToNum(pTargetCents),
      p_target: centsToNum(pTargetCents),
      achievable: true,
      target_time_ms: tTargetMs,
      t_target_ms: tTargetMs,
      target_time_seconds: centsToNum(tTargetCs),
      t_target_s: centsToNum(tTargetCs),
      target_time_display: formatTimeMs(tTargetMs),
      t_target_formatted: formatTimeMs(tTargetMs),
      diff_behind_leader_ms: diffMs,
      diff_behind_leader_display: `+${(diffMs / 1000).toFixed(2)}s`,
      diff_behind_leader_s: Number((diffMs / 1000).toFixed(2)),
      run1_ms: run1Ms,
      run2_needed_ms: run2NeededMs,
      run2_needed_seconds: run2NeededSeconds,
      run2_needed_display: run2NeededFormatted,
      run2_needed_formatted: run2NeededFormatted,
    },
  };
}

function handleCalcListSim(body, mutant) {
  const disc = (body.discipline || 'GS').toUpperCase();
  if (!VECTORS.disciplines[disc]) {
    return { status: 422, json: { detail: `Unknown discipline: ${disc}` } };
  }
  const season = Number(body.season ?? 2027);
  const rawResults = Array.isArray(body.results) ? body.results : [];
  if (rawResults.length === 0) {
    return { status: 422, json: { detail: 'At least 1 result required' } };
  }

  const isTech = disc === 'SL' || disc === 'GS';
  const slotsRequired =
    season >= 2027 && isTech && mutant !== 'best2-gs' ? 3 : 2;

  const sorted = rawResults.map((r) => toCents(r)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const counting = sorted.slice(0, slotsRequired);
  const n = counting.length;
  const sumCents = counting.reduce((s, x) => s + x, 0n);
  const rawAvgCents = divHalfUp(sumCents, BigInt(n));

  let multPct = 100n;
  let penaltyFlag = '';
  if (n < slotsRequired) {
    if (slotsRequired === 3 && n === 2) {
      multPct = 120n;
      penaltyFlag = '^';
    } else if (slotsRequired === 3 && n === 1) {
      multPct = 144n;
      penaltyFlag = '^^';
    } else if (slotsRequired === 2 && n === 1) {
      multPct = 120n;
      penaltyFlag = '+';
    }
  }

  const simCents = divHalfUp(sumCents * multPct, BigInt(n) * 100n);
  const simulated = centsToNum(simCents);
  const curCents = body.current_list_points !== undefined && body.current_list_points !== null
    ? toCents(body.current_list_points)
    : null;
  const multVal = Number((Number(multPct) / 100).toFixed(2));

  return {
    status: 200,
    json: {
      discipline: disc,
      season,
      counting_slots: slotsRequired,
      slots_required: slotsRequired,
      results_used: counting.map(centsToNum),
      counting_results: counting.map(centsToNum),
      raw_average: centsToNum(rawAvgCents),
      multiplier: multVal,
      penalty_multiplier: multVal,
      penalty_flag: penaltyFlag,
      penalty_note: penaltyFlag ? `Multiplier ${multVal}x (${penaltyFlag})` : 'Full counting slots met',
      simulated_points: simulated,
      current_list_points: curCents !== null ? centsToNum(curCents) : null,
      delta_vs_current: curCents !== null ? centsToNum(simCents - curCents) : null,
    },
  };
}

function buildSharedCss(mutant) {
  const radius = mutant === 'rounded-cards' ? '12px' : '0px';
  const reducedRule =
    mutant === 'reduced-motion-hidden'
      ? `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; } .gate-section { opacity: 0 !important; } }`
      : `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; } }`;

  const overflowRule =
    mutant === 'mobile-overflow'
      ? `@media (max-width: 959px) { .overflow-mutant { width: 430px !important; min-width: 430px !important; display: block; height: 24px; background: var(--color-surface); } }`
      : `.overflow-mutant { display: none; }`;

  const tapRule =
    mutant === 'small-tap-target'
      ? `.tap-target, [role="tab"], .filter-btn, .gate-jump, .curve-node-hit { min-width: 24px !important; min-height: 24px !important; width: 28px !important; height: 28px !important; padding: 2px !important; }`
      : `.tap-target, [role="tab"], .filter-btn, .gate-jump, .racer-row-btn, .nav-link, .lang-btn, .menu-toggle, .btn-action { min-width: 44px; min-height: 44px; }`;

  const accentFloodRule =
    mutant === 'accent-flood'
      ? `.hero-section, .hub-main, .partners-hero { background: #E07119 !important; color: #0A0A0A !important; }`
      : '';

  return `
@font-face {
  font-family: 'Libron';
  src: url('/fonts/Libron.ttf') format('truetype');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'IBM Plex Sans';
  src: url('/fonts/IBMPlexSans.ttf') format('truetype');
  font-weight: 400 700;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'IBM Plex Mono';
  src: url('/fonts/IBMPlexMono.ttf') format('truetype');
  font-weight: 400 700;
  font-style: normal;
  font-display: swap;
}
:root {
  --color-bg: #0A0A0A;
  --color-surface: #161615;
  --color-ink: #F5F4F0;
  --color-ink-muted: #9B988F;
  --color-accent: #E07119;
  --color-accent-secondary: #C29136;
  --font-display: 'Libron', serif;
  --font-body: 'IBM Plex Sans', sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;
  --radius: ${radius};
}
* { box-sizing: border-box; border-radius: ${radius}; }
html, body {
  margin: 0;
  padding: 0;
  background-color: var(--color-bg);
  color: var(--color-ink);
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.5;
  box-shadow: none;
}
a { color: var(--color-ink); text-decoration: none; }
button, input, select {
  font-family: var(--font-mono);
  color: var(--color-ink);
  background: var(--color-surface);
  border: 1px solid #2E2D29;
  border-radius: ${radius};
}
.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.skip-link {
  position: absolute; left: 8px; top: -48px; z-index: 999;
  background: var(--color-accent); color: #0A0A0A; padding: 10px 14px;
}
.skip-link:focus { top: 8px; }
.app-shell { display: flex; min-height: 100vh; width: 100%; }
.timing-rail {
  width: 224px; flex: 0 0 224px; border-right: 1px solid #262522;
  background: var(--color-bg); padding: 24px 16px; position: sticky; top: 0; height: 100vh;
  display: flex; flex-direction: column; justify-content: space-between;
}
.mobile-topbar { display: none; }
.mobile-drawer { display: none; }
.main-content { flex: 1; min-width: 0; padding: 32px 40px 72px; }
.hero-section {
  position: relative; display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 32px;
  align-items: end; padding-bottom: 48px; border-bottom: 1px solid #262522;
}
.hero-h1 {
  font-family: var(--font-display); font-size: clamp(58px, 10vw, 138px); line-height: 0.92;
  margin: 0 0 16px 0; letter-spacing: -0.02em; color: var(--color-ink);
}
.media-plate {
  border: 1px solid #2C2B27; background: var(--color-surface);
  position: relative; display: flex; align-items: flex-end; padding: 16px; width: 100%;
}
.plate-4-5 { aspect-ratio: 4 / 5; max-width: 340px; }
.plate-3-2 { aspect-ratio: 3 / 2; max-width: 480px; }
.plate-16-9 { aspect-ratio: 16 / 9; max-width: 560px; }
.plate-1-1 { aspect-ratio: 1 / 1; max-width: 300px; }
.hero-scrim {
  position: relative;
  background-image: linear-gradient(180deg, rgba(10,10,10,0.08) 0%, rgba(10,10,10,0.72) 100%);
}
.course-grid {
  display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 40px; padding-top: 40px; align-items: start;
}
.split-board {
  position: sticky; top: 24px; border: 1px solid #2A2925; background: var(--color-surface); padding: 16px; min-width: 0;
}
#gates-column { min-width: 0; max-width: 100%; }
.gate-section {
  border: 1px solid #262522; background: var(--color-surface); padding: 24px; min-width: 0; max-width: 100%;
  transition: opacity 0.2s linear;
}
.gate-header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.nor-am-nowrap { white-space: nowrap; }
.table-scroll { width: 100%; max-width: 100%; overflow-x: auto; }
.dls-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-family: var(--font-mono); font-size: 13px; }
.dls-table th, .dls-table td { text-align: left; padding: 6px 14px 6px 0; border-bottom: 1px solid #262522; }
.mobile-inline-chart { display: none; }
.connector-wrap { padding: 8px 0; display: block; width: 100%; }
.hub-tablist { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.hub-tab[aria-selected="true"] { border-color: var(--color-accent); color: var(--color-accent); }
.telemetry-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
.telemetry-cell { border: 1px solid #2C2B27; background: var(--color-surface); padding: 12px; min-width: 0; }
.racer-row-btn {
  width: 100%; text-align: left; display: grid; grid-template-columns: 44px 44px minmax(0, 1fr) 84px 72px;
  gap: 8px; align-items: center; padding: 10px 12px; margin-bottom: 6px; cursor: pointer;
}
.racer-row-btn > span { min-width: 0; overflow-wrap: anywhere; }
.nav-link { display: inline-flex; align-items: center; padding: 10px 8px; border-left: 2px solid transparent; }
.nav-link[aria-current="page"] { border-left-color: var(--color-accent); color: var(--color-accent); }
.gate-jump {
  display: inline-flex; align-items: center; padding: 10px 16px; border: 1px solid var(--color-accent);
  color: var(--color-ink); background: var(--color-surface); font-family: var(--font-mono); cursor: pointer;
}
.btn-action {
  display: inline-flex; align-items: center; justify-content: center; padding: 10px 16px; cursor: pointer; max-width: 100%;
}
.badge-accent {
  border: 1px solid var(--color-accent); color: var(--color-accent); padding: 2px 6px; font-family: var(--font-mono); font-size: 11px;
}
@media (max-width: 959px) {
  .app-shell { display: block; }
  .timing-rail { display: none; }
  .mobile-topbar {
    display: flex; position: sticky; top: 0; z-index: 50; height: 52px; max-height: 54px;
    background: var(--color-bg); border-bottom: 1px solid #262522; padding: 4px 12px;
    align-items: center; justify-content: space-between; gap: 8px;
  }
  .mobile-drawer[data-open="true"] {
    display: flex; flex-direction: column; position: fixed; inset: 52px 0 0 0; z-index: 60;
    background: var(--color-bg); padding: 20px; gap: 12px;
  }
  .main-content { padding: 16px 14px 48px; }
  .hero-section { grid-template-columns: minmax(0, 1fr); gap: 16px; padding-bottom: 28px; }
  .hero-h1 { font-size: 56px; }
  .course-grid { grid-template-columns: minmax(0, 1fr); gap: 20px; padding-top: 20px; }
  .split-board { display: none; }
  .mobile-inline-chart { display: block; margin-top: 16px; }
  .telemetry-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .racer-row-btn { grid-template-columns: 34px 34px minmax(0, 1fr) 68px 56px; font-size: 12px; padding: 8px 6px; }
}
${tapRule}
${overflowRule}
${reducedRule}
${accentFloodRule}
`;
}

function buildNavHtml(activeRoute, lang = 'en') {
  const fr = lang === 'fr';
  const bibRole = fr ? 'CAN · FIS 6100596 · GS / ENTRAÎNEUR-CHEF U18' : 'CAN · FIS 6100596 · GS / HEAD COACH U18';
  const links = [
    { href: '/#start-gate', label: fr ? 'DÉPART' : 'START GATE', key: '/' },
    { href: '/#course-gates', label: fr ? 'LE PARCOURS' : 'THE COURSE', key: 'course' },
    { href: '/hub', label: fr ? 'CHRONO / HUB' : 'TIMING HUB', key: '/hub' },
    { href: '/partners', label: fr ? 'PARTENAIRES' : 'PARTNERS', key: '/partners' },
  ];
  const linkTags = links
    .map(
      (l) =>
        `<a class="nav-link mono" href="${l.href}"${
          activeRoute === l.key ? ' aria-current="page"' : ''
        }>${l.label}</a>`
    )
    .join('\n');

  return `
<a class="skip-link mono" href="#main-content">SKIP TO CONTENT</a>
<header class="mobile-topbar">
  <div class="mono" style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">CAN · FIS 6100596 · <span class="run-clock">00:00.00</span></div>
  <div style="display:flex;gap:6px;align-items:center;">
    <button type="button" class="lang-btn btn-action" aria-label="Toggle language">${fr ? 'EN' : 'FR'}</button>
    <button type="button" class="menu-toggle btn-action" aria-expanded="false" aria-controls="mobile-nav-drawer">MENU</button>
  </div>
</header>
<nav id="mobile-nav-drawer" class="mobile-drawer" aria-label="Mobile Navigation" data-open="false">
  <div class="mono" style="font-size:12px;color:var(--color-ink-muted);">${bibRole}</div>
  ${linkTags}
</nav>
<aside class="timing-rail" aria-label="Timing Rail">
  <div>
    <div class="mono" style="font-size:11px;color:var(--color-ink-muted);margin-bottom:8px;">${bibRole}</div>
    <div class="mono" style="font-size:28px;color:var(--color-accent);margin-bottom:24px;"><span class="run-clock">00:00.00</span></div>
    <nav aria-label="Primary Navigation" style="display:flex;flex-direction:column;gap:4px;">
      ${linkTags}
    </nav>
  </div>
  <div style="display:flex;gap:8px;">
    <button type="button" class="lang-btn btn-action" aria-label="Switch language EN/FR">EN / FR</button>
  </div>
</aside>`;
}

function buildHomeHtml(mutant) {
  const entriesText = mutant === 'starts-typo' ? '147 STARTS' : '147 ENTRIES';
  const thirtyThree = mutant === 'starts-typo' ? '33 starts' : '33 entries';
  const entFinCol = mutant === 'starts-typo' ? 'STR / FIN' : 'ENT / FIN';
  const leak5838 = mutant === 'leak-5838' ? ' 58.38 list.' : '';
  const bannedCopy =
    mutant === 'banned-copy'
      ? '<p>I am passionate about crafting digital experiences with seamless innovative solutions that elevate every turn.</p>'
      : '';

  const connectorSvg = (idx, isPause = false) => {
    const isOdd = idx % 2 === 1;
    const gateX = isOdd ? 210 : 70;
    const color = isOdd ? '#E07119' : '#F5F4F0';
    const d = isOdd
      ? 'M 70 2 C 70 26, 210 20, 210 40 C 210 58, 70 54, 70 74'
      : 'M 210 2 C 210 26, 70 20, 70 40 C 70 58, 210 54, 210 74';
    const dash = isPause ? ' stroke-dasharray="6 5"' : '';
    return `<div class="connector-wrap"><svg class="course-connector" viewBox="0 0 280 76" width="100%" height="76" aria-hidden="true">
      <path d="${d}" fill="none" stroke="${color}" stroke-width="1.5"${dash} />
      <circle cx="${gateX}" cy="38" r="6" fill="${color}" />
      <rect x="${gateX - 1}" y="24" width="2" height="28" fill="${color}" />
    </svg></div>`;
  };

  const gate01D3Svg = `
    <svg viewBox="0 0 320 150" width="100%" height="150" role="img" aria-label="DLS to U18 Rank Progression Graph">
      <text x="8" y="16" fill="#9B988F" font-size="10" font-family="IBM Plex Mono">DLS -> U18 RANK LADDER (#29 -> #1)</text>
      <path d="M 24 130 L 68 38 L 112 72 L 156 34 L 200 54 L 244 29 L 296 22" fill="none" stroke="#E07119" stroke-width="2" />
      <circle cx="24" cy="130" r="4" fill="#F5F4F0" data-rank="29" />
      <circle cx="68" cy="38" r="4" fill="#F5F4F0" data-rank="4" />
      <circle cx="112" cy="72" r="4" fill="#F5F4F0" data-rank="13" />
      <circle cx="156" cy="34" r="4" fill="#F5F4F0" data-rank="3" />
      <circle cx="200" cy="54" r="4" fill="#F5F4F0" data-rank="8" />
      <circle cx="244" cy="29" r="4" fill="#F5F4F0" data-rank="2" />
      <circle cx="296" cy="22" r="5" fill="#E07119" data-rank="1" />
    </svg>`;

  const gate04D3Svg = `
    <svg viewBox="0 0 320 150" width="100%" height="150" role="img" aria-label="3-Season Average vs Race Best Chart">
      <text x="8" y="16" fill="#9B988F" font-size="10" font-family="IBM Plex Mono">3-SEASON AVG (83.5->53.5) VS BEST (56.60->36.12)</text>
      <path d="M 40 36 L 160 72 L 280 94" fill="none" stroke="#9B988F" stroke-width="2" />
      <path d="M 40 88 L 160 108 L 280 128" fill="none" stroke="#E07119" stroke-width="2" />
      <circle cx="40" cy="36" r="4" fill="#9B988F" />
      <circle cx="160" cy="72" r="4" fill="#9B988F" />
      <circle cx="280" cy="94" r="4" fill="#9B988F" />
      <circle cx="40" cy="88" r="4" fill="#E07119" />
      <circle cx="160" cy="108" r="4" fill="#E07119" />
      <circle cx="280" cy="128" r="4" fill="#E07119" />
    </svg>`;

  const gate07D3Svg = `
    <svg viewBox="0 0 320 150" width="100%" height="150" role="img" aria-label="11-Week Comeback Trace vs 36.12 Threshold">
      <text x="8" y="16" fill="#9B988F" font-size="10" font-family="IBM Plex Mono">11-WEEK COMEBACK: 46.35 -> 34.95 PB (THRESH 36.12)</text>
      <line x1="20" y1="98" x2="300" y2="98" stroke="#C29136" stroke-dasharray="4 4" stroke-width="1.5" data-threshold="36.12" />
      <path d="M 40 48 L 140 52 L 280 118" fill="none" stroke="#E07119" stroke-width="2" />
      <circle cx="40" cy="48" r="4" fill="#9B988F" data-label="DNF2" />
      <circle cx="140" cy="52" r="4" fill="#F5F4F0" data-pts="46.35" />
      <circle cx="280" cy="118" r="5" fill="#E07119" data-pts="34.95" />
    </svg>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Julian Brunet — Alpine Ski Racer &amp; Head Coach U18</title>
  <meta name="description" content="Julian Brunet portfolio, career run gates 2014–2027, and live FIS timing hub." />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
<div class="app-shell">
  ${buildNavHtml('/', 'en')}
  <main id="main-content" class="main-content">
    <div class="overflow-mutant"></div>
    <section id="start-gate" class="hero-section">
      <div>
        <div class="mono" style="font-size:12px;color:var(--color-ink-muted);margin-bottom:8px;">START GATE 00 · CAN · FIS 6100596</div>
        <h1 class="hero-h1">JULIAN<br/>BRUNET</h1>
        <p class="mono" style="font-size:18px;margin:0 0 12px 0;color:var(--color-accent);">BEST GS 34.95</p>
        <p style="max-width:46ch;margin:0 0 20px 0;">Alpine GS specialist turned Head Coach, U18 FIS Men at Club de Ski Mont Garceau. ${entriesText} across six FIS winters, returning from nine months off gates to a 34.95 career best.</p>
        ${bannedCopy}
        <a href="#course-gates" class="gate-jump" role="button">GATE 01 ↓</a>
      </div>
      <div class="media-plate plate-4-5 hero-scrim" role="img" aria-label="4:5 Start Gate Architectural Plate">
        <div class="mono" style="font-size:12px;">SLOT 4:5 · START GATE PLATE · MONT GARCEAU</div>
      </div>
    </section>

    <section id="course-gates" class="course-grid">
      <aside class="split-board" aria-label="Split Telemetry Board">
        <div class="mono" style="font-size:11px;color:var(--color-ink-muted);margin-bottom:6px;">FIS GS POINTS TRAJECTORY (2021–2026)</div>
        <svg id="split-curve-svg" viewBox="0 0 320 150" width="100%" height="150" role="img" aria-label="Signature 2021 to 2026 GS FIS points curve">
          <path d="M 28 24 L 84 82 L 140 94 L 196 112 L 252 112 L 296 124" fill="none" stroke="#E07119" stroke-width="2" />
          <g class="curve-node-hit" role="button" tabindex="0" aria-label="2021–22 Start: 127.09 GS pts" data-readout="2021–22: 127.09 -> 58.88 GS">
            <rect x="6" y="2" width="44" height="44" fill="transparent" />
            <circle cx="28" cy="24" r="5" fill="#F5F4F0" />
          </g>
          <g class="curve-node-hit" role="button" tabindex="0" aria-label="2022–23 End: 47.45 GS pts" data-readout="2022–23: 47.45 GS (#880)">
            <rect x="118" y="72" width="44" height="44" fill="transparent" />
            <circle cx="140" cy="94" r="5" fill="#F5F4F0" />
          </g>
          <g class="curve-node-hit" role="button" tabindex="0" aria-label="2024–25 Peak: 36.84 (#459)" data-readout="2024–25: 36.84 GS (#459 world)">
            <rect x="230" y="90" width="44" height="44" fill="transparent" />
            <circle cx="252" cy="112" r="5" fill="#F5F4F0" />
          </g>
          <g class="curve-node-hit" role="button" tabindex="0" aria-label="Apr 2026 PB: 34.95 GS pts" data-readout="Apr 11, 2026: 34.95 GS Career Best">
            <rect x="274" y="102" width="44" height="44" fill="transparent" />
            <circle cx="296" cy="124" r="6" fill="#E07119" />
          </g>
        </svg>
        <div id="curve-readout" class="mono" style="font-size:12px;margin:8px 0 14px;color:var(--color-accent);">2021–26: 127.09 -> 58.88 -> 47.45 -> 36.84 -> 34.95 PB</div>
        <div id="contextual-bay" style="border-top:1px solid #2C2B27;padding-top:12px;">
          <div id="bay-title" class="mono" style="font-size:12px;color:var(--color-ink-muted);margin-bottom:8px;">GATE 01 CONTEXT · DLS TO U18</div>
          <div id="bay-body">${gate01D3Svg}</div>
        </div>
      </aside>

      <div id="gates-column">
        ${connectorSvg(1)}
        <article id="gate-01" class="gate-section" data-gate="01">
          <div class="gate-header">
            <h2 style="font-family:var(--font-display);margin:0;">GATE 01 · DLS TO U18</h2>
            <span class="mono">2014–2020</span>
          </div>
          <p>Club Tremblant circuit from #29 (U12 Yr1) to #2 (U16 Yr2), including #3 overall in U14 Yr2 with 2,120 pts, cresting one cohort spot every two years to #1 U18 Super Series Champ.</p>
          <div class="table-scroll">
          <table class="dls-table">
            <thead><tr><th>SEASON</th><th>OVERALL</th><th>COHORT</th><th>PTS</th><th>NOTES</th></tr></thead>
            <tbody>
              <tr><td>2014–15 U12 Yr1</td><td>#29</td><td>#4</td><td>728</td><td>Club TREMB rookie</td></tr>
              <tr><td>2015–16 U12 Yr2</td><td>#4</td><td>#3</td><td>2,030</td><td>+25 overall, +1 cohort</td></tr>
              <tr><td>2016–17 U14 Yr1</td><td>#13</td><td>#3</td><td>858</td><td>Group A</td></tr>
              <tr><td>2017–18 U14 Yr2</td><td>#3</td><td>#3</td><td>2,120</td><td>DLS podium</td></tr>
              <tr><td>2018–19 U16 Yr1</td><td>#8</td><td>#3</td><td>1,130</td><td>Group E</td></tr>
              <tr><td>2019–20 U16 Yr2</td><td>#2</td><td>#2</td><td>1,700</td><td>Vice-champion, +1 cohort</td></tr>
            </tbody>
          </table>
          </div>
          <div class="mobile-inline-chart">${gate01D3Svg}</div>
        </article>

        ${connectorSvg(2, true)}
        <article id="gate-02" class="gate-section" data-gate="02">
          <div class="gate-header">
            <h2 style="font-family:var(--font-display);margin:0;">GATE 02 · COVID WINTER</h2>
            <span class="mono">2020–2021</span>
          </div>
          <p>First FIS year at Mont-Tremblant coached by my father. Zero official starts (0 starts / 0 finishes) under pandemic cancellations.</p>
        </article>

        ${connectorSvg(3)}
        <article id="gate-03" class="gate-section" data-gate="03">
          <div class="gate-header">
            <h2 style="font-family:var(--font-display);margin:0;">GATE 03 · U18 SUPER SERIES CHAMP</h2>
            <span class="mono">2021–2022</span>
          </div>
          <p>From zero starts to #1 U18 overall in the Ski Quebec Alpin Super Series: ${thirtyThree}, 22 finishes, 7 top-10, 2 top-5, 1 win (Georgian Peaks GS 61.16), GS list 127.09 -> 58.88, 56.60 race best.</p>
          <div class="media-plate plate-3-2" role="img" aria-label="3:2 Gate 03 Media Plate" style="margin-top:12px;">
            <span class="mono" style="font-size:12px;">SLOT 3:2 · SUPER SERIES U18 PLATE</span>
          </div>
        </article>

        ${connectorSvg(4)}
        <article id="gate-04" class="gate-section" data-gate="04">
          <div class="gate-header">
            <h2 style="font-family:var(--font-display);margin:0;">GATE 04 · S1 RACING &amp; BREAKOUT</h2>
            <span class="mono">2022–2024</span>
          </div>
          <p>Three-season trajectory average 83.5 -> 64.6 -> 53.5 and race best 56.60 -> 46.22 -> 36.12 (Mont Garceau GS, Mar 15, 2024). European circuit Passo Furcia SL 42.66 (Nov–Dec 2023).</p>
        </article>

        ${connectorSvg(5)}
        <article id="gate-05" class="gate-section" data-gate="05">
          <div class="gate-header">
            <h2 style="font-family:var(--font-display);margin:0;">GATE 05 · ÉQUIPE DU QUÉBEC &amp; <span class="nor-am-nowrap">Nor-Am</span></h2>
            <span class="mono">2024–2025</span>
          </div>
          <p>Top 500 world GS on 2024–25 Lists 5–13 (peak #459, 6th list). Whiteface GS 4th (37.00), Mont Garceau 3rd (40.67), Mont Édouard 3rd (41.13), Stoneham 5th (37.80). Panorama Nor-Am SG 36th (85.50) and 53rd (99.73); Sugarloaf DNQ1 &amp; DNS; Adstock training crash.</p>
          <div class="media-plate plate-16-9" role="img" aria-label="16:9 Gate 05 Media Plate" style="margin-top:12px;">
            <span class="mono" style="font-size:12px;">SLOT 16:9 · NOR-AM STEEP PITCH PLATE</span>
          </div>
        </article>

        ${connectorSvg(6, true)}
        <article id="gate-06" class="gate-section" data-gate="06">
          <div class="gate-header">
            <h2 style="font-family:var(--font-display);margin:0;">GATE 06 · NINE MONTHS OFF GATES</h2>
            <span class="mono">Apr 2025 – Jan 2026</span>
          </div>
          <p>Coached U16 and Programme Plus at Mont Garceau with 0 gate sessions across 9 months (284 days, Apr 13, 2025 to Jan 22, 2026).</p>
        </article>

        ${connectorSvg(7)}
        <article id="gate-07" class="gate-section" data-gate="07">
          <div class="gate-header">
            <h2 style="font-family:var(--font-display);margin:0;">GATE 07 · ELEVEN-WEEK COMEBACK</h2>
            <span class="mono">Jan–Apr 2026</span>
          </div>
          <p>Jan 22 DNF2, Jan 23 GS 14th (46.35). Eleven weeks later on Apr 11, 2026 at Mont Sainte-Anne: GS 12th in 34.95, breaking the 36.12 career best by 1.17.${leak5838}</p>
          <div class="mobile-inline-chart">${gate07D3Svg}</div>
        </article>

        ${connectorSvg(8)}
        <article id="gate-08" class="gate-section" data-gate="08">
          <div class="gate-header">
            <h2 style="font-family:var(--font-display);margin:0;">GATE 08 · HEAD COACH U18 &amp; CAREER LEDGER</h2>
            <span class="mono">2026–2027</span>
          </div>
          <p>Head Coach, U18 FIS Men (8 first-year athletes) at Club de Ski Mont Garceau. Full ledger: ${entriesText}, 96 finishes (65%), 40/7/3/1 (DNF/DNS/DNQ/DSQ), 1 win, 6 podiums, 16 top-5, 33 top-10.</p>
          <div class="table-scroll">
          <table class="dls-table">
            <thead><tr><th>DISCIPLINE</th><th>${entFinCol}</th><th>TOP 10</th><th>AVG</th><th>BEST</th></tr></thead>
            <tbody>
              <tr><td>GS</td><td>72 / 50</td><td>21</td><td>58.5</td><td>34.95</td></tr>
              <tr><td>SL</td><td>72 / 43</td><td>11</td><td>68.2</td><td>42.66</td></tr>
              <tr><td>SG</td><td>3 / 3</td><td>1</td><td>—</td><td>85.50</td></tr>
            </tbody>
          </table>
          </div>
          <div class="media-plate plate-1-1" role="img" aria-label="1:1 Gate 08 Media Plate" style="margin-top:12px;">
            <span class="mono" style="font-size:12px;">SLOT 1:1 · COACH U18 MONT GARCEAU</span>
          </div>
        </article>

        ${connectorSvg(9)}
        <footer style="padding:16px 0;border-top:1px solid #262522;" class="mono">
          FINISH · <a href="/hub">TIMING HUB</a> · <a href="/partners">PARTNERS</a>
        </footer>
      </div>
    </section>
  </main>
</div>

<script>
(() => {
  let lang = 'en';
  const bayTitle = document.getElementById('bay-title');
  const bayBody = document.getElementById('bay-body');
  const gates = {
    '01': { title: 'GATE 01 CONTEXT · DLS TO U18', html: ${JSON.stringify(gate01D3Svg)} },
    '02': { title: 'GATE 02 CONTEXT · COVID ZERO STATE', html: '<div class="mono" style="font-size:12px;">0 starts / 0 finishes · COVID cancellations · Mont-Tremblant coached by father</div>' },
    '03': { title: 'GATE 03 CONTEXT · U18 SUPER SERIES', html: '<div class="mono" style="font-size:12px;">${thirtyThree} · 22 fin · 7 top-10 · 2 top-5 · 1 win · #1 U18 · 127.09 -> 58.88 · 56.60 race best</div>' },
    '04': { title: 'GATE 04 CONTEXT · 3-SEASON PROGRESSION', html: ${JSON.stringify(gate04D3Svg)} },
    '05': { title: 'GATE 05 CONTEXT · STEEP PITCH', html: '<div class="mono" style="font-size:12px;">#459 World GS (2024–25 Lists 5–13) · Whiteface 37.00 · Panorama SG 85.50 / 99.73 · Sugarloaf DNQ1/DNS · Adstock · 37.80 / 41.13</div>' },
    '06': { title: 'GATE 06 CONTEXT · GAP TELEMETRY', html: '<div class="mono" style="font-size:12px;">9 months / 284 days · 0 gate sessions · Apr 13, 2025 -> Jan 22, 2026</div>' },
    '07': { title: 'GATE 07 CONTEXT · 11-WEEK COMEBACK', html: ${JSON.stringify(gate07D3Svg)} },
    '08': { title: 'GATE 08 CONTEXT · LEDGER & COACHING', html: '<div class="mono" style="font-size:12px;">${entriesText} · 96 fin (65%) · 40/7/3/1 · GS 72/50 · SL 72/43 · SG 3/3 · 8 first-year U18 FIS Men</div>' }
  };

  function syncBayOnScroll() {
    const scrollY = window.scrollY || 0;
    const sec = Math.floor(scrollY / 40);
    const cs = Math.floor((scrollY % 40) * 2.4);
    const clockStr = String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0') + '.' + String(cs).padStart(2, '0');
    document.querySelectorAll('.run-clock').forEach(el => { el.textContent = clockStr; });

    let active = '01';
    const els = Array.from(document.querySelectorAll('[data-gate]'));
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.top <= window.innerHeight * 0.45) {
        active = el.getAttribute('data-gate');
      }
    }
    const spec = gates[active];
    if (spec && bayTitle.dataset.active !== active) {
      bayTitle.dataset.active = active;
      bayTitle.textContent = spec.title;
      bayBody.innerHTML = spec.html;
    }
  }
  window.addEventListener('scroll', syncBayOnScroll, { passive: true });
  syncBayOnScroll();

  document.querySelectorAll('.curve-node-hit').forEach(node => {
    const activate = () => {
      const ro = document.getElementById('curve-readout');
      if (ro) ro.textContent = node.getAttribute('data-readout');
    };
    node.addEventListener('click', activate);
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });
  });

  const drawer = document.getElementById('mobile-nav-drawer');
  const menuBtn = document.querySelector('.menu-toggle');
  function setDrawer(open) {
    drawer.setAttribute('data-open', open ? 'true' : 'false');
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
  }
  menuBtn?.addEventListener('click', () => setDrawer(drawer.getAttribute('data-open') !== 'true'));
  drawer?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setDrawer(false)));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') setDrawer(false); });

  const origTexts = new Map();
  document.querySelectorAll('main p, main th, main h2').forEach((el, idx) => {
    origTexts.set(idx, el.innerHTML);
  });

  function applyLocale(fr) {
    lang = fr ? 'fr' : 'en';
    document.documentElement.lang = lang;
    document.querySelectorAll('.lang-btn').forEach(b => { b.textContent = fr ? 'EN' : 'FR'; });
    document.querySelectorAll('a[href="/#start-gate"]').forEach(a => { a.textContent = fr ? 'DÉPART' : 'START GATE'; });
    document.querySelectorAll('a[href="/#course-gates"]').forEach(a => { a.textContent = fr ? 'LE PARCOURS' : 'THE COURSE'; });
    document.querySelectorAll('a[href="/hub"]').forEach(a => { a.textContent = fr ? 'CHRONO / HUB' : 'TIMING HUB'; });
    document.querySelectorAll('a[href="/partners"]').forEach(a => { a.textContent = fr ? 'PARTENAIRES' : 'PARTNERS'; });
    document.querySelectorAll('main p, main th, main h2').forEach((el, idx) => {
      const orig = origTexts.get(idx);
      if (orig === undefined) return;
      if (fr) {
        el.innerHTML = orig
          .replace('147 ENTRIES', '147 INSCRIPTIONS')
          .replace('33 entries', '33 inscriptions')
          .replace('ENT / FIN', 'INS / FIN')
          .replace('Nov–Dec 2023', 'nov.–déc. 2023');
      } else {
        el.innerHTML = orig;
      }
    });
  }
  document.querySelectorAll('.lang-btn').forEach(b => b.addEventListener('click', () => applyLocale(lang === 'en')));
})();
</script>
</body>
</html>`;
}

function buildHubHtml(mutant) {
  const bannedCopy =
    mutant === 'banned-copy' ? '<p>Seamless innovative solutions elevate this timing hub.</p>' : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Timing Room / Hub — Julian Brunet</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
<div class="app-shell">
  ${buildNavHtml('/hub', 'en')}
  <main id="main-content" class="main-content hub-main">
    <div class="overflow-mutant"></div>
    <h1 id="hub-title" style="font-family:var(--font-display);font-size:clamp(36px,6vw,64px);margin:0 0 12px 0;">TIMING ROOM</h1>
    ${bannedCopy}

    <div class="hub-tablist" role="tablist" aria-label="Hub Modes">
      <button type="button" role="tab" id="tab-live" class="hub-tab btn-action" aria-selected="true" aria-controls="panel-live">LIVE</button>
      <button type="button" role="tab" id="tab-race" class="hub-tab btn-action" aria-selected="false" aria-controls="panel-race">RACE</button>
      <button type="button" role="tab" id="tab-calc" class="hub-tab btn-action" aria-selected="false" aria-controls="panel-calc">CALC</button>
      <button type="button" role="tab" id="tab-athletes" class="hub-tab btn-action" aria-selected="false" aria-controls="panel-athletes">ATHLETES</button>
    </div>

    <section id="panel-live" role="tabpanel" aria-labelledby="tab-live">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center;">
        <label class="mono" style="font-size:12px;"><span data-i18n="dateLabel">DATE</span> <input id="hub-date" type="date" value="2026-04-11" style="padding:8px;min-height:44px;max-width:100%;" /></label>
        <button type="button" id="filter-live-btn" class="filter-btn btn-action" data-filter="LIVE">LIVE NOW</button>
        <button type="button" id="filter-fis-btn" class="filter-btn btn-action" data-filter="FIS">FIS</button>
        <button type="button" id="filter-can-btn" class="filter-btn btn-action" data-filter="CAN_USA">CAN/USA</button>
        <button type="button" id="filter-all-btn" class="filter-btn btn-action" data-filter="ALL">ALL</button>
        <button type="button" id="demo-309223-btn" class="btn-action">2026-04-11 MSA 309223</button>
      </div>
      <div id="live-races-list"></div>
    </section>

    <section id="panel-race" role="tabpanel" aria-labelledby="tab-race" hidden>
      <div id="race-restriction-banner" class="mono" style="margin-bottom:12px;color:var(--color-accent);" hidden></div>
      <div class="telemetry-strip">
        <div class="telemetry-cell"><div id="lbl-penalty" class="mono" style="font-size:11px;color:var(--color-ink-muted);">PENALTY</div><div id="cell-penalty" class="mono" style="font-size:20px;">—</div></div>
        <div class="telemetry-cell"><div id="lbl-to" class="mono" style="font-size:11px;color:var(--color-ink-muted);">LEADER To</div><div id="cell-to" class="mono" style="font-size:20px;">—</div></div>
        <div class="telemetry-cell"><div id="lbl-f" class="mono" style="font-size:11px;color:var(--color-ink-muted);">F-VALUE</div><div id="cell-f" class="mono" style="font-size:20px;">—</div></div>
        <div class="telemetry-cell"><div id="lbl-status" class="mono" style="font-size:11px;color:var(--color-ink-muted);">STATUS</div><div id="cell-status" class="mono" style="font-size:20px;">—</div></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <button type="button" id="subtab-results" class="btn-action">RESULTS</button>
        <button type="button" id="subtab-penalty" class="btn-action">PENALTY BREAKDOWN</button>
        <button type="button" id="subtab-h2h" class="btn-action">START LIST / H2H</button>
        <label class="mono" style="font-size:12px;"><span data-i18n="raceSeason">SEASON</span> <select id="race-season" style="padding:8px;min-height:44px;"><option value="2026">2026</option><option value="2027" selected>2027</option></select></label>
      </div>
      <div id="race-view-results"></div>
      <div id="race-view-penalty" hidden></div>
      <div id="race-view-h2h" hidden></div>
    </section>

    <section id="panel-calc" role="tabpanel" aria-labelledby="tab-calc" hidden>
      <div style="border:1px solid #2C2B27;background:var(--color-surface);padding:14px;margin-bottom:16px;">
        <h2 id="explainer-title" class="mono" style="font-size:14px;margin:0 0 6px 0;">RACE POINTS VS LIST POINTS</h2>
        <p id="explainer-body" style="margin:0;font-size:14px;">Race Points measure how fast you skied against the winner in one race (P = ((T - To) / To) * F). Your Race Total adds the Race Penalty (P + Penalty). List Points are your official FIS ranking average across your best results (Best-3 in SL/GS or Best-2 in DH/SG/AC for 2026/27).</p>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:16px;">
        <form id="target-form" style="border:1px solid #2C2B27;background:var(--color-surface);padding:14px;min-width:0;">
          <h2 id="target-form-title" class="mono" style="font-size:14px;margin:0 0 10px 0;">TARGET TIME &amp; RUN 2 CALCULATOR</h2>
          <div style="display:grid;gap:8px;">
            <label class="mono" style="font-size:12px;"><span data-i18n="leaderTime">Leader Time To (s)</span> <input id="calc-to" type="text" value="109.47" style="width:100%;padding:8px;min-height:44px;" /></label>
            <label class="mono" style="font-size:12px;"><span data-i18n="discipline">Discipline</span> <select id="calc-disc" style="width:100%;padding:8px;min-height:44px;"><option value="GS" selected>GS</option><option value="SL">SL</option><option value="SG">SG</option><option value="DH">DH</option><option value="AC">AC</option></select></label>
            <label class="mono" style="font-size:12px;"><span data-i18n="penalty">Penalty</span> <input id="calc-pen" type="text" value="24.25" style="width:100%;padding:8px;min-height:44px;" /></label>
            <label class="mono" style="font-size:12px;"><span data-i18n="targetPts">Target FIS Pts</span> <input id="calc-target" type="text" value="34.95" style="width:100%;padding:8px;min-height:44px;" /></label>
            <label class="mono" style="font-size:12px;"><span data-i18n="run1Time">Run 1 Time (s)</span> <input id="calc-r1" type="text" value="56.96" style="width:100%;padding:8px;min-height:44px;" /></label>
            <button type="submit" id="calc-target-submit" class="btn-action" style="border-color:var(--color-accent);">CALCULATE TARGET</button>
          </div>
          <div id="target-output" class="mono" style="margin-top:10px;font-size:14px;"></div>
        </form>

        <form id="sim-form" style="border:1px solid #2C2B27;background:var(--color-surface);padding:14px;min-width:0;">
          <h2 id="sim-form-title" class="mono" style="font-size:14px;margin:0 0 10px 0;">NEXT-LIST SIMULATOR (SEASON 2027 BEST-3 / BEST-2)</h2>
          <div style="display:grid;gap:8px;">
            <label class="mono" style="font-size:12px;"><span data-i18n="discipline">Discipline</span> <select id="sim-disc" style="width:100%;padding:8px;min-height:44px;"><option value="GS" selected>GS</option><option value="SL">SL</option><option value="SG">SG</option><option value="DH">DH</option><option value="AC">AC</option></select></label>
            <label class="mono" style="font-size:12px;"><span data-i18n="season">Season</span> <select id="sim-season" style="width:100%;padding:8px;min-height:44px;"><option value="2027" selected>2027</option><option value="2026">2026</option></select></label>
            <label class="mono" style="font-size:12px;"><span data-i18n="raceScores">Race Scores (comma separated)</span> <input id="sim-scores" type="text" value="42.95, 54.35" style="width:100%;padding:8px;min-height:44px;" /></label>
            <button type="submit" id="sim-submit" class="btn-action" style="border-color:var(--color-accent);">SIMULATE LIST</button>
          </div>
          <div id="sim-output" class="mono" style="margin-top:10px;font-size:14px;"></div>
        </form>
      </div>
    </section>

    <section id="panel-athletes" role="tabpanel" aria-labelledby="tab-athletes" hidden>
      <form id="athlete-search-form" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <input id="athlete-query" type="search" aria-label="Search FIS code or athlete name" placeholder="FIS code (e.g. 6100596) or name" style="flex:1;min-width:min(180px,100%);padding:10px;min-height:44px;" />
        <button type="submit" id="athlete-search-submit" class="btn-action">SEARCH ATHLETE</button>
      </form>
      <div id="athlete-results"></div>
      <div id="athlete-profile" style="margin-top:16px;"></div>
    </section>
  </main>
</div>

<script>
(() => {
  let lang = 'en';
  let currentFilter = 'ALL';
  let currentRaces = [];
  let currentLiveData = null;
  let pollTimer = null;

  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));

  function showTab(name) {
    const key = name.toLowerCase();
    tabs.forEach(t => {
      const active = t.id === 'tab-' + key;
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    panels.forEach(p => {
      p.hidden = p.id !== 'panel-' + key;
    });
  }
  tabs.forEach(t => t.addEventListener('click', () => showTab(t.id.replace('tab-', ''))));

  function renderRacesList() {
    const container = document.getElementById('live-races-list');
    let list = currentRaces.slice();
    if (currentFilter === 'LIVE') list = list.filter(r => r.zone_status === 'L');
    else if (currentFilter === 'FIS') list = list.filter(r => Boolean(r.fis_codex) && r.source_type !== 'N');
    else if (currentFilter === 'CAN_USA') list = list.filter(r => r.country === 'CAN' || r.country === 'USA');

    if (list.length === 0) {
      const emptyMsg = lang === 'fr' ? 'AUCUNE COURSE POUR CETTE DATE / CE FILTRE' : 'NO RACES MATCH CURRENT DATE / FILTER';
      container.innerHTML = '<div class="mono" style="padding:16px;border:1px solid #2C2B27;">' + emptyMsg + '</div>';
      return;
    }
    container.innerHTML = list.map(r => \`
      <button type="button" class="btn-action" data-lt-id="\${r.lt_id}" style="width:100%;justify-content:space-between;margin-bottom:8px;text-align:left;gap:8px;flex-wrap:wrap;">
        <span class="mono">\${r.name} · \${r.resort}</span>
        <span class="mono" style="color:var(--color-accent);">LT \${r.lt_id} · \${r.discipline} · \${r.country} · CODEX \${r.fis_codex || '—'} · \${r.zone_status}</span>
      </button>
    \`).join('');
    container.querySelectorAll('[data-lt-id]').forEach(btn => {
      btn.addEventListener('click', () => loadRaceLive(btn.getAttribute('data-lt-id')));
    });
  }

  async function fetchRaces(dateStr) {
    const res = await fetch('/api/hub/races?date=' + encodeURIComponent(dateStr) + '&fis_only=false');
    const data = await res.json();
    currentRaces = data.races || [];
    renderRacesList();
  }

  async function loadRaceLive(ltId) {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    const season = document.getElementById('race-season').value || '2027';
    const res = await fetch('/api/hub/races/' + encodeURIComponent(ltId) + '/live?m=0&season=' + season + '&category=FIS');
    if (!res.ok) return;
    currentLiveData = await res.json();
    showTab('race');
    renderRaceLive();
    if (currentLiveData.online) {
      pollTimer = setInterval(async () => {
        const r = await fetch('/api/hub/races/' + encodeURIComponent(ltId) + '/live?m=' + encodeURIComponent(currentLiveData.server_stamp || '0') + '&season=' + season);
        if (r.ok) { currentLiveData = await r.json(); renderRaceLive(); }
      }, 6000);
    }
  }

  function renderRaceLive() {
    const d = currentLiveData;
    if (!d) return;
    const banner = document.getElementById('race-restriction-banner');
    if (d.restriction_notice) {
      banner.hidden = false;
      banner.textContent = d.restriction_notice;
    } else {
      banner.hidden = true;
      banner.textContent = '';
    }

    const penEl = document.getElementById('cell-penalty');
    const badges = [];
    if (d.penalty?.adder > 0) badges.push('<span class="badge-accent">+8</span>');
    if (d.penalty?.clamped) badges.push('<span class="badge-accent">CLAMPED</span>');
    if (d.penalty?.double_max_triggered) badges.push('<span class="badge-accent">2×MAX</span>');
    penEl.innerHTML = (d.penalty?.applied_penalty !== null && d.penalty?.applied_penalty !== undefined ? Number(d.penalty.applied_penalty).toFixed(2) : '—') + ' ' + badges.join(' ');
    document.getElementById('cell-to').textContent = d.leader_time_ms ? (d.leader_time_ms / 1000).toFixed(2) + 's' : '—';
    document.getElementById('cell-f').textContent = String(d.race?.f_value ?? '—');
    document.getElementById('cell-status').textContent = d.penalty?.status || '—';

    const resEl = document.getElementById('race-view-results');
    resEl.innerHTML = (d.racers || []).map((r, idx) => \`
      <div>
        <button type="button" class="racer-row-btn mono" data-expand="\${idx}">
          <span>\${r.rank ?? '—'}</span>
          <span>#\${r.bib}</span>
          <span>\${r.name} (\${r.nation})</span>
          <span>\${r.total_display ?? '—'}</span>
          <span style="color:var(--color-accent);">\${r.expected_fis_points !== null && r.expected_fis_points !== undefined ? Number(r.expected_fis_points).toFixed(2) : '—'}</span>
        </button>
        <div id="racer-detail-\${idx}" hidden style="padding:8px 12px 14px;border:1px solid #262522;margin-bottom:8px;" class="mono">
          R1: \${r.r1_display ?? '—'} · R2: \${r.r2_display ?? '—'}\${r.r3_display ? ' · R3: ' + r.r3_display : ''} · Status: \${r.status}
          <button type="button" class="btn-action" data-jump-target="\${idx}" style="margin-left:12px;">Target Time</button>
        </div>
      </div>
    \`).join('');

    resEl.querySelectorAll('[data-expand]').forEach(btn => {
      btn.addEventListener('click', () => {
        const det = document.getElementById('racer-detail-' + btn.getAttribute('data-expand'));
        det.hidden = !det.hidden;
      });
    });

    resEl.querySelectorAll('[data-jump-target]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const r = d.racers[Number(btn.getAttribute('data-jump-target'))];
        showTab('calc');
        if (d.leader_time_ms) document.getElementById('calc-to').value = (d.leader_time_ms / 1000).toFixed(2);
        if (d.race?.discipline) document.getElementById('calc-disc').value = d.race.discipline;
        if (d.penalty?.applied_penalty !== null && d.penalty?.applied_penalty !== undefined) {
          document.getElementById('calc-pen').value = Number(d.penalty.applied_penalty).toFixed(2);
        }
        if (r.r1_ms) document.getElementById('calc-r1').value = (r.r1_ms / 1000).toFixed(2);
        if (r.expected_fis_points) document.getElementById('calc-target').value = Number(r.expected_fis_points).toFixed(2);
        await runTargetCalc();
      });
    });

    document.getElementById('race-view-penalty').innerHTML = \`
      <div class="mono" style="border:1px solid #2C2B27;padding:14px;">
        <div>Sum A: \${d.penalty?.sum_a ?? '—'} · Sum B: \${d.penalty?.sum_b ?? '—'} · Sum C: \${d.penalty?.sum_c ?? '—'}</div>
        <div>Raw: \${d.penalty?.raw_calc ?? '—'} · Adder: \${d.penalty?.adder ?? '—'} · Applied: \${d.penalty?.applied_penalty ?? '—'}</div>
        <div>\${d.penalty?.confidence_note || ''}</div>
      </div>\`;

    document.getElementById('race-view-h2h').innerHTML = \`
      <div class="mono" style="border:1px solid #2C2B27;padding:14px;">
        <div>START LIST / H2H THREATS: \${(d.penalty?.threats || []).length} active threats</div>
        \${(d.penalty?.threats || []).map(t => \`<div>Bib #\${t.bib} \${t.name} (\${t.fis_points}) — \${t.status}</div>\`).join('')}
      </div>\`;
  }

  document.getElementById('subtab-results').addEventListener('click', () => {
    document.getElementById('race-view-results').hidden = false;
    document.getElementById('race-view-penalty').hidden = true;
    document.getElementById('race-view-h2h').hidden = true;
  });
  document.getElementById('subtab-penalty').addEventListener('click', () => {
    document.getElementById('race-view-results').hidden = true;
    document.getElementById('race-view-penalty').hidden = false;
    document.getElementById('race-view-h2h').hidden = true;
  });
  document.getElementById('subtab-h2h').addEventListener('click', () => {
    document.getElementById('race-view-results').hidden = true;
    document.getElementById('race-view-penalty').hidden = true;
    document.getElementById('race-view-h2h').hidden = false;
  });
  document.getElementById('race-season').addEventListener('change', () => {
    if (currentLiveData?.lt_id) loadRaceLive(currentLiveData.lt_id);
  });

  document.getElementById('hub-date').addEventListener('change', (e) => fetchRaces(e.target.value));
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => { currentFilter = btn.getAttribute('data-filter'); renderRacesList(); });
  });
  document.getElementById('demo-309223-btn').addEventListener('click', async () => {
    document.getElementById('hub-date').value = '2026-04-11';
    await fetchRaces('2026-04-11');
    await loadRaceLive('309223');
  });

  async function runTargetCalc() {
    const res = await fetch('/api/hub/calc/target', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        discipline: document.getElementById('calc-disc').value,
        leader_time_ms: Math.round(Number(document.getElementById('calc-to').value) * 1000),
        penalty: Number(document.getElementById('calc-pen').value),
        target_fis_points: Number(document.getElementById('calc-target').value),
        run1_ms: Math.round(Number(document.getElementById('calc-r1').value || 0) * 1000) || null
      })
    });
    const out = await res.json();
    if (!res.ok) {
      document.getElementById('target-output').textContent = out.detail || 'Error';
    } else if (out.achievable === false) {
      document.getElementById('target-output').textContent = 'Unachievable target: target_fis_points < penalty';
    } else {
      const disp = out.target_time_display || out.t_target_formatted;
      const secs = out.target_time_seconds ?? out.t_target_s;
      const r2 = out.run2_needed_display || out.run2_needed_formatted || '—';
      document.getElementById('target-output').textContent =
        'Target: ' + disp + ' (' + Number(secs).toFixed(2) + 's) · Run 2 needed: ' + r2;
    }
  }
  document.getElementById('target-form').addEventListener('submit', async (e) => { e.preventDefault(); await runTargetCalc(); });

  async function runSimCalc() {
    const scores = document.getElementById('sim-scores').value.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n));
    const res = await fetch('/api/hub/calc/list-sim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        discipline: document.getElementById('sim-disc').value,
        season: Number(document.getElementById('sim-season').value),
        results: scores
      })
    });
    const out = await res.json();
    const slots = out.counting_slots ?? out.slots_required;
    const mult = out.multiplier ?? out.penalty_multiplier;
    document.getElementById('sim-output').textContent = res.ok
      ? 'Simulated List: ' + out.simulated_points.toFixed(2) + ' (Slots: ' + slots + ', Mult: ' + mult + 'x ' + (out.penalty_flag || '') + ')'
      : (out.detail || 'Error');
  }
  document.getElementById('sim-form').addEventListener('submit', async (e) => { e.preventDefault(); await runSimCalc(); });

  document.getElementById('athlete-search-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = document.getElementById('athlete-query').value.trim();
    const res = await fetch('/api/hub/athletes/search?q=' + encodeURIComponent(q));
    const data = await res.json();
    const listEl = document.getElementById('athlete-results');
    if (!data.athletes || data.athletes.length === 0) {
      const emptyAth = lang === 'fr' ? 'AUCUN ATHLÈTE TROUVÉ' : 'NO ATHLETES FOUND';
      listEl.innerHTML = '<div class="mono" style="padding:12px;border:1px solid #2C2B27;">' + emptyAth + '</div>';
      document.getElementById('athlete-profile').innerHTML = '';
      return;
    }
    listEl.innerHTML = data.athletes.map(a => \`
      <button type="button" class="btn-action mono" data-comp-id="\${a.competitor_id}" style="width:100%;justify-content:space-between;margin-bottom:8px;">
        <span>\${a.name} · \${a.nation} · FIS \${a.fis_code} (\${a.birth_year})</span>
        <span>\${a.active ? 'ACTIVE' : 'NOT ACTIVE'} · GS \${a.points?.GS ?? '—'}</span>
      </button>\`).join('');
    listEl.querySelectorAll('[data-comp-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pr = await fetch('/api/hub/athletes/' + encodeURIComponent(btn.getAttribute('data-comp-id')));
        const prof = await pr.json();
        document.getElementById('athlete-profile').innerHTML = \`
          <div class="mono" style="border:1px solid #2C2B27;padding:14px;">
            <div><strong>\${prof.profile.name}</strong> · FIS \${prof.profile.fis_code} · \${prof.profile.club} · Status: \${prof.profile.active ? 'ACTIVE' : 'Not active'}</div>
            <div>Points: GS \${prof.current_points.GS ?? '—'} · SL \${prof.current_points.SL ?? '—'} · SG \${prof.current_points.SG ?? '—'}</div>
            <div>H2H COMPARISON READY vs ACTIVE RACE</div>
          </div>\`;
      });
    });
  });

  const drawer = document.getElementById('mobile-nav-drawer');
  const menuBtn = document.querySelector('.menu-toggle');
  function setDrawer(open) {
    drawer.setAttribute('data-open', open ? 'true' : 'false');
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
  }
  menuBtn?.addEventListener('click', () => setDrawer(drawer.getAttribute('data-open') !== 'true'));
  drawer?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setDrawer(false)));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') setDrawer(false); });

  const i18nHub = {
    en: {
      hubTitle: 'TIMING ROOM',
      tabLive: 'LIVE',
      tabRace: 'RACE',
      tabCalc: 'CALC',
      tabAthletes: 'ATHLETES',
      filterLive: 'LIVE NOW',
      filterAll: 'ALL',
      lblPenalty: 'PENALTY',
      lblTo: 'LEADER To',
      lblF: 'F-VALUE',
      lblStatus: 'STATUS',
      subResults: 'RESULTS',
      subPenalty: 'PENALTY BREAKDOWN',
      subH2h: 'START LIST / H2H',
      explainerTitle: 'RACE POINTS VS LIST POINTS',
      targetTitle: 'TARGET TIME & RUN 2 CALCULATOR',
      simTitle: 'NEXT-LIST SIMULATOR (SEASON 2027 BEST-3 / BEST-2)',
      calcSubmit: 'CALCULATE TARGET',
      simSubmit: 'SIMULATE LIST',
      athSubmit: 'SEARCH ATHLETE',
      dateLabel: 'DATE',
      raceSeason: 'SEASON',
      leaderTime: 'Leader Time To (s)',
      discipline: 'Discipline',
      penalty: 'Penalty',
      targetPts: 'Target FIS Pts',
      run1Time: 'Run 1 Time (s)',
      season: 'Season',
      raceScores: 'Race Scores (comma separated)',
    },
    fr: {
      hubTitle: 'SALLE DE CHRONO',
      tabLive: 'EN DIRECT',
      tabRace: 'COURSE',
      tabCalc: 'CALCUL',
      tabAthletes: 'ATHLÈTES',
      filterLive: 'EN DIRECT',
      filterAll: 'TOUTES',
      lblPenalty: 'PÉNALITÉ',
      lblTo: 'MENEUR To',
      lblF: 'VALEUR F',
      lblStatus: 'STATUT',
      subResults: 'RÉSULTATS',
      subPenalty: 'DÉTAIL PÉNALITÉ',
      subH2h: 'LISTE DÉPART / H2H',
      explainerTitle: 'POINTS DE COURSE VS POINTS DE LISTE',
      targetTitle: 'CALCULATEUR TEMPS CIBLE & MANCHE 2',
      simTitle: 'SIMULATEUR PROCHAINE LISTE (SAISON 2027 MEILLEURS 3 / 2)',
      calcSubmit: 'CALCULER TEMPS CIBLE',
      simSubmit: 'SIMULER LISTE',
      athSubmit: 'RECHERCHER ATHLÈTE',
      dateLabel: 'DATE',
      raceSeason: 'SAISON',
      leaderTime: 'Temps meneur To (s)',
      discipline: 'Discipline',
      penalty: 'Pénalité',
      targetPts: 'Pts FIS cibles',
      run1Time: 'Temps Manche 1 (s)',
      season: 'Saison',
      raceScores: 'Points de course (séparés par virgule)',
    }
  };

  function applyHubLocale(nextLang) {
    lang = nextLang;
    const fr = lang === 'fr';
    const d = i18nHub[lang];
    document.documentElement.lang = lang;
    document.getElementById('hub-title').textContent = d.hubTitle;
    document.getElementById('tab-live').textContent = d.tabLive;
    document.getElementById('tab-race').textContent = d.tabRace;
    document.getElementById('tab-calc').textContent = d.tabCalc;
    document.getElementById('tab-athletes').textContent = d.tabAthletes;
    document.getElementById('filter-live-btn').textContent = d.filterLive;
    document.getElementById('filter-all-btn').textContent = d.filterAll;
    document.getElementById('lbl-penalty').textContent = d.lblPenalty;
    document.getElementById('lbl-to').textContent = d.lblTo;
    document.getElementById('lbl-f').textContent = d.lblF;
    document.getElementById('lbl-status').textContent = d.lblStatus;
    document.getElementById('subtab-results').textContent = d.subResults;
    document.getElementById('subtab-penalty').textContent = d.subPenalty;
    document.getElementById('subtab-h2h').textContent = d.subH2h;
    document.getElementById('explainer-title').textContent = d.explainerTitle;
    document.getElementById('target-form-title').textContent = d.targetTitle;
    document.getElementById('sim-form-title').textContent = d.simTitle;
    document.getElementById('calc-target-submit').textContent = d.calcSubmit;
    document.getElementById('sim-submit').textContent = d.simSubmit;
    document.getElementById('athlete-search-submit').textContent = d.athSubmit;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.getAttribute('data-i18n');
      if (d[k]) el.textContent = d[k];
    });
    document.querySelectorAll('.nav-link').forEach(a => {
      const href = a.getAttribute('href');
      if (href === '/#start-gate') a.textContent = fr ? 'DÉPART' : 'START GATE';
      if (href === '/#course-gates') a.textContent = fr ? 'LE PARCOURS' : 'THE COURSE';
      if (href === '/hub') a.textContent = fr ? 'CHRONO / HUB' : 'TIMING HUB';
      if (href === '/partners') a.textContent = fr ? 'PARTENAIRES' : 'PARTNERS';
    });
    document.querySelectorAll('.lang-btn').forEach(btn => { btn.textContent = fr ? 'EN' : 'FR'; });
    renderRacesList();
  }

  document.querySelectorAll('.lang-btn').forEach(b => b.addEventListener('click', () => {
    applyHubLocale(lang === 'en' ? 'fr' : 'en');
  }));

  fetchRaces('2026-04-11');
  runTargetCalc();
  runSimCalc();
})();
</script>
</body>
</html>`;
}

function buildPartnersHtml(mutant) {
  const leak = mutant === 'leak-5838' ? ' Latest 2026/27 list 58.38.' : '';
  const banned = mutant === 'banned-copy' ? '<p>Let\'s build something amazing together with seamless solutions.</p>' : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Finish Area &amp; Partners — Julian Brunet</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
<div class="app-shell">
  ${buildNavHtml('/partners', 'en')}
  <main id="main-content" class="main-content partners-hero">
    <div class="overflow-mutant"></div>
    <div id="partners-kicker" class="mono" style="font-size:12px;color:var(--color-ink-muted);">FINISH AREA · PRESS &amp; PARTNERSHIPS</div>
    <h1 id="partners-h1" style="font-family:var(--font-display);font-size:clamp(42px,8vw,96px);margin:8px 0 16px;">PARTNERS &amp; FINISH AREA</h1>
    <p id="partners-copy" style="max-width:56ch;">Julian Brunet — Head Coach, U18 FIS Men at Club de Ski Mont Garceau (8 first-year athletes). Verified career record: 34.95 GS PB (Mont Sainte-Anne, Apr 11, 2026), #459 world GS (2024–25 Lists 5–13), 6 FIS podiums, 147 entries and 96 finishes (65%).${leak}</p>
    ${banned}
    <div style="margin-top:24px;display:flex;gap:12px;flex-wrap:wrap;">
      <a id="partners-cta" href="mailto:partners@jbrunet.com" class="btn-action" style="border:1px solid var(--color-accent);">MEDIA KIT &amp; SPONSORSHIP INQUIRY</a>
      <a id="partners-hub" href="/hub" class="btn-action" style="border:1px solid #2C2B27;">OPEN TIMING HUB</a>
    </div>
  </main>
</div>
<script>
(() => {
  let lang = 'en';
  const drawer = document.getElementById('mobile-nav-drawer');
  const menuBtn = document.querySelector('.menu-toggle');
  function setDrawer(open) {
    drawer.setAttribute('data-open', open ? 'true' : 'false');
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
  }
  menuBtn?.addEventListener('click', () => setDrawer(drawer.getAttribute('data-open') !== 'true'));
  drawer?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setDrawer(false)));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') setDrawer(false); });

  const enCopy = document.getElementById('partners-copy').innerHTML;
  document.querySelectorAll('.lang-btn').forEach(b => b.addEventListener('click', () => {
    lang = lang === 'en' ? 'fr' : 'en';
    const fr = lang === 'fr';
    document.documentElement.lang = lang;
    document.getElementById('partners-kicker').textContent = fr ? 'AIRE D’ARRIVÉE · PRESSE & PARTENARIATS' : 'FINISH AREA · PRESS & PARTNERSHIPS';
    document.getElementById('partners-h1').textContent = fr ? 'PARTENAIRES & AIRE D’ARRIVÉE' : 'PARTNERS & FINISH AREA';
    document.getElementById('partners-copy').innerHTML = fr
      ? 'Julian Brunet — Entraîneur-chef, U18 FIS Hommes au Club de Ski Mont Garceau (8 athlètes de première année). Bilan vérifié : record personnel 34.95 en GS (Mont Sainte-Anne, 11 avr. 2026), #459 mondial GS (Listes 5–13 2024–25), 6 podiums FIS, 147 inscriptions et 96 arrivées (65%).${leak}'
      : enCopy;
    document.getElementById('partners-cta').textContent = fr ? 'DOSSIER MÉDIA & DEMANDE DE PARTENARIAT' : 'MEDIA KIT & SPONSORSHIP INQUIRY';
    document.getElementById('partners-hub').textContent = fr ? 'OUVRIR CHRONO / HUB' : 'OPEN TIMING HUB';
    document.querySelectorAll('.nav-link').forEach(a => {
      const href = a.getAttribute('href');
      if (href === '/#start-gate') a.textContent = fr ? 'DÉPART' : 'START GATE';
      if (href === '/#course-gates') a.textContent = fr ? 'LE PARCOURS' : 'THE COURSE';
      if (href === '/hub') a.textContent = fr ? 'CHRONO / HUB' : 'TIMING HUB';
      if (href === '/partners') a.textContent = fr ? 'PARTENAIRES' : 'PARTNERS';
    });
    document.querySelectorAll('.lang-btn').forEach(btn => { btn.textContent = fr ? 'EN' : 'FR'; });
  }));
})();
</script>
</body>
</html>`;
}

function buildNotFoundHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DNF / DSQ — You missed a gate.</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
<div class="app-shell">
  ${buildNavHtml('404', 'en')}
  <main id="main-content" class="main-content">
    <div class="mono" style="color:var(--color-accent);font-size:14px;">DNF / DSQ · HTTP 404</div>
    <h1 id="nf-h1" style="font-family:var(--font-display);font-size:clamp(42px,8vw,96px);margin:12px 0;">You missed a gate.</h1>
    <p id="nf-copy">That split does not exist on the hill. Return to the Start Gate or open the Timing Hub.</p>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:20px;">
      <a id="nf-home" href="/" class="btn-action" style="border:1px solid var(--color-accent);">RETURN TO START GATE</a>
      <a id="nf-hub" href="/hub" class="btn-action" style="border:1px solid #2C2B27;">TIMING HUB</a>
    </div>
  </main>
</div>
<script>
(() => {
  let lang = 'en';
  const drawer = document.getElementById('mobile-nav-drawer');
  const menuBtn = document.querySelector('.menu-toggle');
  function setDrawer(open) {
    drawer.setAttribute('data-open', open ? 'true' : 'false');
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
  }
  menuBtn?.addEventListener('click', () => setDrawer(drawer.getAttribute('data-open') !== 'true'));
  drawer?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setDrawer(false)));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') setDrawer(false); });

  document.querySelectorAll('.lang-btn').forEach(b => b.addEventListener('click', () => {
    lang = lang === 'en' ? 'fr' : 'en';
    const fr = lang === 'fr';
    document.documentElement.lang = lang;
    document.getElementById('nf-h1').textContent = fr ? 'Porte manquée.' : 'You missed a gate.';
    document.getElementById('nf-copy').textContent = fr ? 'Cet intermédiaire n’existe pas sur la piste. Retournez au départ ou ouvrez le Chrono / Hub.' : 'That split does not exist on the hill. Return to the Start Gate or open the Timing Hub.';
    document.getElementById('nf-home').textContent = fr ? 'RETOUR AU DÉPART' : 'RETURN TO START GATE';
    document.getElementById('nf-hub').textContent = fr ? 'CHRONO / HUB' : 'TIMING HUB';
    document.querySelectorAll('.nav-link').forEach(a => {
      const href = a.getAttribute('href');
      if (href === '/#start-gate') a.textContent = fr ? 'DÉPART' : 'START GATE';
      if (href === '/#course-gates') a.textContent = fr ? 'LE PARCOURS' : 'THE COURSE';
      if (href === '/hub') a.textContent = fr ? 'CHRONO / HUB' : 'TIMING HUB';
      if (href === '/partners') a.textContent = fr ? 'PARTENAIRES' : 'PARTNERS';
    });
    document.querySelectorAll('.lang-btn').forEach(btn => { btn.textContent = fr ? 'EN' : 'FR'; });
  }));
})();
</script>
</body>
</html>`;
}

export async function startMockServer({ port = 0, mutant = null } = {}) {
  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const p = reqUrl.pathname;

    const sendJson = (status, data) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(data));
    };

    const sendHtml = (status, html) => {
      res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    };

    if (p === '/favicon.svg') {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#0A0A0A"/><circle cx="16" cy="16" r="6" fill="#E07119"/></svg>');
      return;
    }

    if (p === '/fonts/Libron.ttf') {
      if (mutant === 'broken-font') {
        res.writeHead(404);
        res.end('Missing font');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'font/ttf' });
      res.end(FONT_BYTES.display);
      return;
    }
    if (p === '/fonts/IBMPlexSans.ttf') {
      res.writeHead(200, { 'Content-Type': 'font/ttf' });
      res.end(FONT_BYTES.body);
      return;
    }
    if (p === '/fonts/IBMPlexMono.ttf') {
      res.writeHead(200, { 'Content-Type': 'font/ttf' });
      res.end(FONT_BYTES.mono);
      return;
    }
    if (p === '/styles.css') {
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      res.end(buildSharedCss(mutant));
      return;
    }

    // API routes
    if (p === '/api/hub/health') {
      return sendJson(200, {
        ok: true,
        fis_list: VECTORS.al2027,
        cache_mode: 'memory+tmp',
        upstream_sources: { live_timing: 'ok', fis_ski: 'ok' },
      });
    }

    if (p === '/api/hub/races') {
      const dateStr = reqUrl.searchParams.get('date') || '2026-04-11';
      const fisOnly = reqUrl.searchParams.get('fis_only') === 'true';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return sendJson(422, { detail: 'Invalid date format, expected YYYY-MM-DD' });
      }
      const [, m, d] = dateStr.split('-').map(Number);
      const maxDays = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (m < 1 || m > 12 || d < 1 || d > maxDays[m]) {
        return sendJson(422, { detail: 'Invalid calendar date' });
      }
      if (dateStr === '2026-11-16') {
        return sendJson(200, {
          date: dateStr,
          count: 0,
          sources: { live_timing_ok: true, fis_calendar_ok: true },
          races: [],
        });
      }
      if (dateStr === '2026-04-11') {
        const lines = parseBinLines('daily_races_2026-04-11_snapshot.bin').slice(1);
        let races = lines.map((line) => {
          const parts = {};
          for (const seg of line.split('|')) {
            const idx = seg.indexOf('=');
            if (idx > 0) parts[seg.slice(0, idx)] = seg.slice(idx + 1);
          }
          const [disc, gender] = (parts.hT || 'Giant Slalom=Men').split('=');
          const [country, region] = (parts.hC || 'CAN=QC').split('=');
          const srcType = (parts.hN || 'U=').split('=')[0];
          const raceName = (parts.hN || '').split('=').slice(1).join('=').trim();
          const ltId = parts.hID;
          const hhtVal = parts.hHT === '2' || parts.hHT === 'Y' ? 2 : parts.hHT === '1' ? 1 : 0;
          return {
            lt_id: ltId,
            source_type: srcType,
            name: raceName,
            discipline: disc,
            gender,
            country,
            region,
            resort: parts.hR || '',
            start_time: parts.hST || '',
            zone_status: parts.hZ || 'R',
            fis_codex: parts.hFCODE || null,
            fis_race_id: ltId === '309223' ? '130671' : null,
            fis_category: 'FIS',
            hide_times_mode: hhtVal,
            has_pdf_report: line.includes('hP=pdf'),
          };
        });
        if (fisOnly) races = races.filter((r) => Boolean(r.fis_codex) && r.source_type !== 'N');
        return sendJson(200, {
          date: dateStr,
          count: races.length,
          sources: { live_timing_ok: true, fis_calendar_ok: true },
          races,
        });
      }
      if (dateStr === '2026-11-15') {
        const lines = parseBinLines('daily_races_synthetic_iso.bin').slice(1);
        let races = lines.map((line) => {
          const rawLine = mutant === 'mojibake' ? line : decodeHtmlEntities(line);
          const parts = {};
          for (const seg of rawLine.split('|')) {
            const idx = seg.indexOf('=');
            if (idx > 0) parts[seg.slice(0, idx)] = seg.slice(idx + 1);
          }
          const [disc, gender] = (parts.hT || 'Slalom=Men').split('=');
          const [country, region] = (parts.hC || 'CAN=QC').split('=');
          const srcType = (parts.hN || 'U=').split('=')[0];
          const raceName = (parts.hN || '').split('=').slice(1).join('=').trim();
          const hhtVal = parts.hHT === '2' || parts.hHT === 'Y' ? 2 : parts.hHT === '1' ? 1 : 0;
          return {
            lt_id: parts.hID,
            source_type: srcType,
            name: raceName,
            discipline: disc,
            gender,
            country,
            region,
            resort: parts.hR || '',
            start_time: parts.hST || '',
            zone_status: parts.hZ || 'L',
            fis_codex: parts.hFCODE || null,
            fis_race_id: parts.hID === '990002' ? '135605' : null,
            fis_category: parts.hFCODE ? 'FIS' : null,
            hide_times_mode: hhtVal,
            has_pdf_report: false,
          };
        });
        races.push({
          lt_id: '309519',
          source_type: 'U',
          name: 'AURORA CUP',
          discipline: 'Slalom',
          gender: 'Women',
          country: 'CAN',
          region: 'AB',
          resort: 'Nakiska',
          start_time: '11/15/2026 9:30 AM',
          zone_status: 'R',
          fis_codex: '5440',
          fis_race_id: '135672',
          fis_category: 'FIS',
          hide_times_mode: 0,
          has_pdf_report: false,
        });
        if (fisOnly) races = races.filter((r) => Boolean(r.fis_codex) && r.source_type !== 'N');
        return sendJson(200, {
          date: dateStr,
          count: races.length,
          sources: { live_timing_ok: true, fis_calendar_ok: true },
          races,
        });
      }
      return sendJson(200, {
        date: dateStr,
        count: 0,
        sources: { live_timing_ok: true, fis_calendar_ok: true },
        races: [],
      });
    }

    const liveMatch = p.match(/^\/api\/hub\/races\/([^/]+)\/live$/);
    if (liveMatch) {
      const ltId = liveMatch[1];
      const season = Number(reqUrl.searchParams.get('season') || '2027');
      const category = (reqUrl.searchParams.get('category') || 'FIS').toUpperCase();
      const prevStamp = reqUrl.searchParams.get('m') || '0';
      const payload = buildLivePayloadFromBin(ltId, { season, category, mutant });
      if (!payload) {
        return sendJson(404, { detail: `invalidRaceID=${ltId}` });
      }
      payload.requested_m = Number(prevStamp) || 0;
      if (prevStamp && prevStamp !== '0') {
        payload.is_delta = true;
        payload.delta_polled = true;
        payload.server_stamp = payload.server_stamp || prevStamp;
      }
      return sendJson(200, payload);
    }

    const fisRaceMatch = p.match(/^\/api\/hub\/fis\/race\/(\d+)$/);
    if (fisRaceMatch) {
      const rid = fisRaceMatch[1];
      if (rid === '130671') {
        const r309 = VECTORS.real_races['309223'];
        return sendJson(200, {
          race_id: '130671',
          event_id: '59347',
          season: 2026,
          season_code: 2026,
          codex: '484',
          competition_codex: '484',
          resort: 'Mont Sainte-Anne',
          nation: 'CAN',
          discipline: 'GS',
          discipline_code: 'GS',
          gender: 'M',
          category: 'FIS',
          date: '2026-04-11',
          valid_for_fis_points: true,
          f_value: 1010,
          applied_penalty: r309.season_2026_applied,
          calculated_penalty: r309.raw_calc,
          leader_time_ms: r309.leader_time_ms,
          leader_time_display: formatTimeMs(r309.leader_time_ms),
          results_count: r309.racers.length,
          penalty_audit: {
            double_max_triggered: false,
            clamped: false,
            raw_calc: r309.raw_calc,
            applied_penalty: r309.season_2026_applied,
          },
          results: r309.racers.map((r) => ({
            rank: r.rank,
            bib: r.bib,
            fis_code: r.fis_code,
            competitor_id: r.fis_code === '6100596' ? '256564' : r.fis_code,
            name: r.name,
            nation: r.nation,
            total_time: formatTimeMs(r.total_ms),
            total_display: formatTimeMs(r.total_ms),
            total_ms: r.total_ms,
            fis_points: r.expected_2026,
            points_2027: r.expected_2027,
            status: 'QLF',
          })),
        });
      }
      const rr = VECTORS.real_races[rid];
      if (!rr) return sendJson(404, { detail: `FIS race ${rid} not found` });
      return sendJson(200, {
        race_id: rr.race_id,
        season: rr.season || rr.season_code || 2027,
        season_code: rr.season_code || 2027,
        codex: rr.codex || rr.competition_codex,
        competition_codex: rr.competition_codex,
        discipline: rr.discipline,
        discipline_code: rr.discipline,
        gender: rr.gender,
        category: rr.category,
        f_value: rr.f_value,
        calculated_penalty: rr.calculated_penalty,
        applied_penalty: rr.applied_penalty,
        double_max_triggered: Boolean(rr.double_max_triggered),
        penalty_audit: {
          double_max_triggered: Boolean(rr.double_max_triggered),
          clamped: Boolean(rr.clamped),
          raw_calc: rr.raw_calc,
          adder: rr.adder,
          calculated_penalty: rr.calculated_penalty,
          applied_penalty: rr.applied_penalty,
        },
        results: [
          {
            rank: 1,
            name: rr.winner_name || 'BOGNI BARRY Sofia',
            fis_points: rr.winner_points || rr.applied_penalty,
            status: 'QLF',
          },
          ...(rid === '131463'
            ? [
                { rank: 2, name: 'PIGNATON FAGNANI Carlotta', fis_points: rr.pignaton_points, status: 'QLF' },
                { rank: 3, name: 'DAVIES CACAULT Mia', fis_points: 389.58, status: 'QLF' },
                { rank: 4, name: 'KECERIN Kika', fis_points: rr.kecerin_points, status: 'QLF' },
              ]
            : []),
        ],
      });
    }

    if (p === '/api/hub/athletes/search') {
      const q = (reqUrl.searchParams.get('q') || '').trim().toLowerCase();
      const all = Object.values(VECTORS.athletes);
      const matches = all.filter(
        (a) =>
          a.fis_code.toLowerCase() === q ||
          a.name.toLowerCase().includes(q)
      );
      return sendJson(200, {
        query: reqUrl.searchParams.get('q') || '',
        source: matches.some((m) => !m.active) ? 'fis-ski.com' : 'ALFP2027F.zip',
        athletes: matches,
      });
    }

    const athleteMatch = p.match(/^\/api\/hub\/athletes\/([^/]+)$/);
    if (athleteMatch) {
      const cid = athleteMatch[1];
      const found = Object.values(VECTORS.athletes).find(
        (a) => a.competitor_id === cid || a.fis_code === cid
      );
      if (!found) return sendJson(404, { detail: `Athlete ${cid} not found` });
      return sendJson(200, {
        profile: found,
        current_points: found.points,
        recent_results: found.recent_results || [],
        points_history: [{ season: '2026/27', list: 'List 8', points: found.points }],
      });
    }

    if (p.startsWith('/api/hub/calc/') && req.method === 'POST') {
      const chunks = [];
      for await (const ch of req) chunks.push(ch);
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      } catch {
        return sendJson(400, { detail: 'Invalid JSON body' });
      }
      if (p === '/api/hub/calc/penalty') {
        const out = handleCalcPenalty(body, mutant);
        return sendJson(out.status, out.json);
      }
      if (p === '/api/hub/calc/target') {
        const out = handleCalcTarget(body);
        return sendJson(out.status, out.json);
      }
      if (p === '/api/hub/calc/list-sim') {
        const out = handleCalcListSim(body, mutant);
        return sendJson(out.status, out.json);
      }
    }

    if (p.startsWith('/api/hub/')) {
      return sendJson(404, { detail: `API endpoint not found: ${p}` });
    }

    if (p === '/') return sendHtml(200, buildHomeHtml(mutant));
    if (p === '/hub') return sendHtml(200, buildHubHtml(mutant));
    if (p === '/partners') return sendHtml(200, buildPartnersHtml(mutant));
    return sendHtml(404, buildNotFoundHtml());
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return {
    server,
    port: addr.port,
    baseUrl,
    apiUrl: `${baseUrl}/api/hub`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// Allow standalone CLI execution
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  let port = 0;
  let mutant = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port') port = Number(args[++i]);
    if (args[i] === '--mutant') mutant = args[++i];
  }
  const srv = await startMockServer({ port, mutant });
  console.log(`Mock server listening at ${srv.baseUrl} (mutant=${mutant || 'none'})`);
}
