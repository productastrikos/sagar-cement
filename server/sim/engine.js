// One tick drives everything, every 5 seconds.

const SC = require('./scenarios');
const PR = require('./process');
const LAB = require('./lab');
const CN = require('./connectivity');
const PW = require('./power');
const ADV = require('./advisory');
const HIST = require('../kpi/history');
const { KPIS } = require('../kpi/registry');
const { notify } = require('./store');

const TICK_MS = 5000;
const seen = new Set();
let ticks = 0;
let lastTickAt = Date.now();

function init() {
  PR.init();
  LAB.seedHistory();
  LAB.seedSamples();
  CN.seed();
  PW.init();
  // The demo opens on a live story: XRF drift at Mattampally Kiln 2 and a wet,
  // low-glass slag rake at Jajpur (research scenarios 1 and 6).
  const s1 = SC.start('S1', 'MTP', 'K2'); s1.startedAt -= 60000; s1.level = 1;
  const s6 = SC.start('S6', 'JJP', 'CM1'); s6.startedAt -= 60000; s6.level = 1;
  PR.shiftHistory('MTP', 'K2', SC.DEFS.S1.biases['lab:fcao']); // history reflects the drift that is already underway
  for (let i = 0; i < 3; i++) tick(true);
  KPIS.forEach(HIST.ensure);
  ADV.build().forEach((a) => seen.add(a.id));
}

function tick(quiet = false) {
  SC.tick();
  PR.tick();
  LAB.tick((plant, inst) => CN.conn.list.some((c) => c.plant === plant && c.key === inst && c.state !== 'online'));
  CN.tick();
  PW.tick();
  ADV.tickEffects();
  HIST.tick(KPIS);
  const list = ADV.build();
  if (!quiet) {
    for (const a of list) {
      if (!seen.has(a.id) && a.status === 'open' && ['critical', 'high'].includes(a.severity)) {
        notify(a.severity === 'critical' ? 'urgent' : 'workorder', a.title, `${a.plantName} · ${a.engine}`, a.route, a.plant);
      }
      seen.add(a.id);
    }
  }
  ticks += 1;
  lastTickAt = Date.now();
}

function start() {
  init();
  return setInterval(() => {
    try { tick(); } catch (err) { console.error('Simulation tick failed', err); }
  }, TICK_MS);
}

const status = () => ({ ticks, lastTickAt, tickMs: TICK_MS });

module.exports = { start, tick, status, TICK_MS };
