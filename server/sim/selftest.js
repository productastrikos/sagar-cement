// Plausibility self-test: `node server/sim/selftest.js`
// Boots the simulation in-process (no HTTP) and asserts the guarantees the UI
// relies on: card == drawer hero, honest forecasts, determinism, and that every
// scenario's evidence actually shows up in the data it claims.
const E = require('./engine');
const SC = require('./scenarios');
const LAB = require('./lab');
const PW = require('./power');
const CN = require('./connectivity');
const I = require('../kpi/insight');
const { KPIS } = require('../kpi/registry');
const { byId } = require('../domain/plants');

let failed = 0; let passed = 0;
const check = (ok, msg) => { if (ok) passed += 1; else { failed += 1; console.log(`  ✗ ${msg}`); } };

const timer = E.start(); clearInterval(timer);
for (let i = 0; i < 6; i++) E.tick(true);

console.log('KPI contract');
for (const k of KPIS) {
  const horizons = k.grain === 'rec' ? ['30D', '90D', '180D', '1Y'] : ['12H', '24H', '7D', '30D'];
  for (const tf of horizons) {
    const a = I.insight(k.id, { tf }); const s = a.series; const n = s.nowIndex;
    check(I.card(k.id).value === a.hero.display, `${k.id} ${tf}: card ${I.card(k.id).value} ≠ hero ${a.hero.display}`);
    if (s.canForecast) check(Math.abs(s.forecast[n] - s.actual[n]) < 1e-9, `${k.id} ${tf}: forecast does not start at NOW`);
    for (let i = n; i < s.forecast.length; i++) if (s.lower[i] != null && !(s.lower[i] <= s.forecast[i] + 1e-9 && s.forecast[i] <= s.upper[i] + 1e-9)) { check(false, `${k.id} ${tf}: band does not bracket forecast at ${i}`); break; }
    check(JSON.stringify(I.insight(k.id, { tf }).series) === JSON.stringify(s), `${k.id} ${tf}: not deterministic`);
  }
}

console.log('Scenario evidence');
const run = (key, plant) => { const s = SC.start(key, plant); s.startedAt -= 60000; for (let i = 0; i < 40; i++) E.tick(true); return s; };
run('S3', 'JRB'); run('S5', 'MTP');
for (let i = 0; i < 400; i++) LAB.tick(() => false);
const samples = LAB.lab.samples;
check(samples.some((x) => x.plant === 'MTP' && x.instrument === 'xrd' && x.stage === 'Cement' && x.line === 'CM1' && x.params['Gypsum dehydration'] > 65), 'S5: no cement XRD sample above 65% gypsum dehydration on CM1');
check(samples.some((x) => x.plant === 'JRB' && x.stage === 'Hot meal' && x.params.SO3 > 3.5), 'S3: no hot-meal SO3 above 3.5%');
check(samples.some((x) => x.plant === 'JRB' && x.instrument === 'cal' && String(x.params.Basis).startsWith('ADB')), 'S3: no preliminary ADB calorimeter record');
check(samples.some((x) => x.plant === 'JJP' && x.instrument === 'mic' && x.params['Glass content'] < 85), 'S6: no slag glass below 85%');
const cba = samples.filter((x) => x.plant === 'MTP' && x.instrument === 'cba').slice(0, 5).map((x) => x.params['Predicted raw-meal CaO']);
const xrf = samples.filter((x) => x.plant === 'MTP' && x.instrument === 'xrf' && x.stage === 'Raw meal').slice(0, 5).map((x) => x.params.CaO);
const avg = (a) => a.reduce((p, c) => p + c, 0) / (a.length || 1);
check(cba.length && xrf.length && avg(cba) - avg(xrf) > 0.3, `S1: cross-belt vs XRF residual ${(avg(cba) - avg(xrf)).toFixed(2)} not above 0.3`);
check(Number(I.card('q.fcaoInSpec', { plant: 'MTP' }).raw) < 80, 'S1: Mattampally free lime in spec not depressed');

console.log('Power & data');
run('E1', 'DCP').startedAt -= 90000;
for (let i = 0; i < 40; i++) E.tick(true);
check(PW.power.DCP.projected > 95, `E1: Dachepalli projected MD ${PW.power.DCP.projected}% not above 95%`);
check(PW.mdExposure(byId.JRB, 115).rs === 0, 'MP: 100–120% CMD should carry no penalty');
check(PW.mdExposure(byId.DCP, 125).rs > 0, 'AP: 125% CMD should carry a penalty');
CN.wanOutage('MTP', 30);
for (let i = 0; i < 4; i++) E.tick(true);
check(CN.conn.gateways.MTP.buffer > 20, 'WAN outage: Mattampally buffer did not grow');
check(CN.conn.gateways.MTP.lostTotal === 0, 'WAN outage: records lost');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
