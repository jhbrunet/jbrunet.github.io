#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withCdp } from './cdp_client.mjs';
import { startMockServer } from './mock_server.mjs';
import { runTier1 } from './tier1.mjs';
import { runTier2 } from './tier2.mjs';
import { runTier3 } from './tier3.mjs';
import { runTier4 } from './tier4.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const USAGE =
  'Usage: node tests/e2e/run_e2e.mjs [--tier 1|2|3|4|all] [--base-url URL] [--api-url URL] [--self-test] [--skip-api-py] [--headless-bin PATH] [--filter REGEX] [--json]';

const KNOWN_VALUE_FLAGS = new Set(['--tier', '--base-url', '--api-url', '--headless-bin', '--filter']);
const KNOWN_BOOL_FLAGS = new Set(['--self-test', '--skip-api-py', '--json', '--help', '-h']);

function cliError(message) {
  console.error(`Error: ${message}\n${USAGE}`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = {
    tier: 'all',
    baseUrl: 'http://127.0.0.1:3000',
    apiUrl: null,
    selfTest: false,
    skipApiPy: false,
    headlessBin: process.env.CHROME_BIN || '/usr/bin/chromium',
    filter: null,
    json: false,
  };

  const nextVal = (flag, idx) => {
    if (idx + 1 >= argv.length) cliError(`Missing value for ${flag}`);
    const val = argv[idx + 1];
    if (
      val === '' ||
      KNOWN_VALUE_FLAGS.has(val) ||
      KNOWN_BOOL_FLAGS.has(val) ||
      val.startsWith('--')
    ) {
      cliError(`Missing value for ${flag} (got "${val}")`);
    }
    return val;
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tier') opts.tier = nextVal(a, i++);
    else if (a === '--base-url') opts.baseUrl = nextVal(a, i++);
    else if (a === '--api-url') opts.apiUrl = nextVal(a, i++);
    else if (a === '--self-test') opts.selfTest = true;
    else if (a === '--skip-api-py') opts.skipApiPy = true;
    else if (a === '--headless-bin') opts.headlessBin = nextVal(a, i++);
    else if (a === '--filter') {
      const pattern = nextVal(a, i++);
      try {
        opts.filter = new RegExp(pattern, 'i');
      } catch (err) {
        cliError(`Invalid --filter regex "${pattern}": ${err.message}`);
      }
    } else if (a === '--json') opts.json = true;
    else if (a === '--help' || a === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else {
      cliError(`Unknown CLI argument: ${a}`);
    }
  }

  if (!['1', '2', '3', '4', 'all'].includes(String(opts.tier))) {
    cliError(`Invalid --tier "${opts.tier}"; expected 1|2|3|4|all`);
  }
  for (const [flag, raw] of [
    ['--base-url', opts.baseUrl],
    ...(opts.apiUrl ? [['--api-url', opts.apiUrl]] : []),
  ]) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        cliError(`${flag} must use http or https URL (got "${raw}")`);
      }
    } catch {
      cliError(`Invalid URL for ${flag}: "${raw}"`);
    }
  }

  opts.baseUrl = opts.baseUrl.replace(/\/$/, '');
  opts.apiUrl = (opts.apiUrl || `${opts.baseUrl}/api/hub`).replace(/\/$/, '');
  return opts;
}

function runPythonApiChecks(apiUrl, quiet = false) {
  return new Promise((resolve) => {
    const pyPath = path.join(__dirname, 'api_checks.py');
    const proc = spawn('python3', ['-B', pyPath, '--api-url', apiUrl], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => {
      out += d.toString();
      if (!quiet) process.stdout.write(d);
    });
    proc.stderr.on('data', (d) => {
      err += d.toString();
      if (!quiet) process.stderr.write(d);
    });
    proc.on('close', (code) => {
      resolve({ ok: code === 0, exitCode: code, output: `${out}\n${err}` });
    });
  });
}

async function runTiers({ tier, baseUrl, apiUrl, headlessBin, filterRegex }) {
  const map = {
    '1': [runTier1],
    '2': [runTier2],
    '3': [runTier3],
    '4': [runTier4],
    all: [runTier1, runTier2, runTier3, runTier4],
  };
  const fns = map[String(tier)];
  if (!fns) throw new Error(`Invalid --tier ${tier}; expected 1|2|3|4|all`);

  return withCdp({ headlessBin }, async (cdp) => {
    const reports = [];
    for (const fn of fns) {
      reports.push(await fn({ cdp, baseUrl, apiUrl, filterRegex }));
    }
    return reports;
  });
}

async function runNegativeMutants(headlessBin, { filterRegex = null } = {}) {
  const allMutants = [
    { mutant: 'starts-typo', tierFn: runTier1, filter: /T1-F01-01/ },
    { mutant: 'leak-5838', tierFn: runTier1, filter: /T1-F01-06/ },
    { mutant: 'mobile-overflow', tierFn: runTier2, filter: /T2-OV-02/ },
    { mutant: 'small-tap-target', tierFn: runTier2, filter: /T2-TAP-01|T2-TAP-03/ },
    { mutant: 'rounded-cards', tierFn: runTier2, filter: /T2-CSS-RAD-home-desktop/ },
    { mutant: 'banned-copy', tierFn: runTier2, filter: /T2-BAN-COPY/ },
    { mutant: 'accent-flood', tierFn: runTier2, filter: /T2-ACCENT-home-desktop/ },
    { mutant: 'broken-font', tierFn: runTier1, filter: /T1-F05-01/ },
    { mutant: 'reduced-motion-hidden', tierFn: runTier2, filter: /T2-RM-01/ },
    { mutant: 'float-round', tierFn: runTier2, filter: /T2-RND-01|T2-RND-03/ },
    { mutant: 'clamp-before-adder', tierFn: runTier2, filter: /T2-ADD-01/ },
    { mutant: 'best2-gs', tierFn: runTier1, filter: /T1-F09-05/ },
    { mutant: 'dns1-in-sumb', tierFn: runTier2, filter: /T2-SNT-01/ },
    { mutant: 'mojibake', tierFn: runTier2, filter: /T2-ENC-02/ },
    { mutant: 'on-course-time', tierFn: runTier2, filter: /T2-SNT-02/ },
  ];
  const mutants = filterRegex
    ? allMutants.filter((m) => filterRegex.test(m.mutant) || filterRegex.test(m.filter.source))
    : allMutants;

  const results = [];
  if (mutants.length === 0) return results;
  await withCdp({ headlessBin }, async (cdp) => {
    for (const m of mutants) {
      const srv = await startMockServer({ port: 0, mutant: m.mutant });
      try {
        const rep = await m.tierFn({
          cdp,
          baseUrl: srv.baseUrl,
          apiUrl: srv.apiUrl,
          filterRegex: m.filter,
        });
        const caught = rep.total > 0 && rep.failed > 0;
        results.push({
          mutant: m.mutant,
          caught,
          checksTriggered: rep.total,
          failuresDetected: rep.failed,
          detail: rep.results.filter((r) => r.status === 'FAIL').map((r) => `${r.id}: ${r.detail}`).join(' | '),
        });
      } finally {
        await srv.close();
      }
    }
  });
  return results;
}

function summarizeReports(reports) {
  let passed = 0;
  let failed = 0;
  let total = 0;
  const byFeature = {};
  for (const r of reports) {
    passed += r.passed;
    failed += r.failed;
    total += r.total;
    for (const item of r.results) {
      byFeature[item.feature] = byFeature[item.feature] || { passed: 0, failed: 0 };
      if (item.status === 'PASS') byFeature[item.feature].passed++;
      else byFeature[item.feature].failed++;
    }
  }
  return { passed, failed, total, byFeature };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.selfTest) {
    const srv = await startMockServer({ port: 0 });
    try {
      const apiRes = opts.skipApiPy
        ? { ok: true, skipped: true }
        : await runPythonApiChecks(srv.apiUrl, opts.json);

      const reports = await runTiers({
        tier: opts.tier,
        baseUrl: srv.baseUrl,
        apiUrl: srv.apiUrl,
        headlessBin: opts.headlessBin,
        filterRegex: opts.filter,
      });
      await srv.close();

      const mutantResults = await runNegativeMutants(opts.headlessBin, { filterRegex: opts.filter });
      const summary = summarizeReports(reports);
      const allMutantsCaught = mutantResults.every((m) => m.caught);
      const requireFullSuiteMin = opts.tier === 'all' && !opts.filter;
      const minCheckOk = !requireFullSuiteMin || summary.total >= 160;
      const allOk = apiRes.ok && summary.failed === 0 && allMutantsCaught && minCheckOk;

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              mode: 'self-test',
              ok: allOk,
              apiChecksOk: apiRes.ok,
              summary,
              tiers: reports,
              mutants: mutantResults,
            },
            null,
            2
          )
        );
      } else {
        console.log('\n=== E2E SELF-TEST REPORT ===');
        console.log(`Python api_checks.py: ${apiRes.ok ? 'PASS' : 'FAIL'}`);
        for (const r of reports) {
          console.log(`  ${r.tier}: ${r.passed}/${r.total} PASS (${r.failed} FAIL)`);
          for (const item of r.results.filter((x) => x.status === 'FAIL')) {
            console.log(`    [FAIL] ${item.id} (${item.title}): ${item.detail}`);
          }
        }
        console.log(`Total Opaque-Box Browser/API Checks: ${summary.passed}/${summary.total} PASS`);
        console.log('\n=== NEGATIVE MUTANT KILL VERIFICATION ===');
        for (const m of mutantResults) {
          console.log(
            `  [${m.caught ? 'KILLED' : 'SURVIVED'}] ${m.mutant} (${m.failuresDetected}/${m.checksTriggered} failed) -> ${m.detail}`
          );
        }
      }
      process.exit(allOk ? 0 : 1);
    } finally {
      await srv.close().catch(() => {});
    }
  } else {
    const apiRes = opts.skipApiPy
      ? { ok: true, skipped: true }
      : await runPythonApiChecks(opts.apiUrl, opts.json);

    const reports = await runTiers({
      tier: opts.tier,
      baseUrl: opts.baseUrl,
      apiUrl: opts.apiUrl,
      headlessBin: opts.headlessBin,
      filterRegex: opts.filter,
    });
    const summary = summarizeReports(reports);
    const allOk = apiRes.ok && summary.failed === 0;

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            mode: 'live',
            ok: allOk,
            baseUrl: opts.baseUrl,
            apiUrl: opts.apiUrl,
            apiChecksOk: apiRes.ok,
            summary,
            tiers: reports,
          },
          null,
          2
        )
      );
    } else {
      console.log(`\n=== E2E LIVE REPORT (${opts.baseUrl}) ===`);
      if (!opts.skipApiPy) console.log(`Python api_checks.py: ${apiRes.ok ? 'PASS' : 'FAIL'}`);
      for (const r of reports) {
        console.log(`  ${r.tier}: ${r.passed}/${r.total} PASS (${r.failed} FAIL)`);
        for (const item of r.results.filter((x) => x.status === 'FAIL')) {
          console.log(`    [FAIL] ${item.id} (${item.title}): ${item.detail}`);
        }
      }
      console.log(`Total Checks: ${summary.passed}/${summary.total} PASS`);
    }
    process.exit(allOk ? 0 : 1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
