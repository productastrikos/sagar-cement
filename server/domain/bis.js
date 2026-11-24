// BIS product specifications the quality engine checks every batch against
// (IS 269:2015, IS 1489 Part 1:2015, IS 455:2015 — research doc §D.3).

const BIS = {
  'OPC 53': { standard: 'IS 269:2015', s3: 27, s7: 37, s28: 53, s28max: null, blaineMin: 225, so3Max: 3.5, mgoMax: 6, loiMax: 4, irMax: 5, ist: 30, fst: 600, leChatelier: 10, autoclave: 0.8, scm: 'Performance improver ≤ 5%' },
  'OPC 43': { standard: 'IS 269:2015', s3: 23, s7: 33, s28: 43, s28max: 58, blaineMin: 225, so3Max: 3.5, mgoMax: 6, loiMax: 5, irMax: 5, ist: 30, fst: 600, leChatelier: 10, autoclave: 0.8, scm: 'Performance improver ≤ 5%' },
  PPC: { standard: 'IS 1489 (Part 1):2015', s3: 16, s7: 22, s28: 33, s28max: null, blaineMin: 300, so3Max: 3.5, mgoMax: 6, loiMax: 5, irMax: null, ist: 30, fst: 600, leChatelier: 10, autoclave: 0.8, scm: 'Fly ash 15–35%' },
  PSC: { standard: 'IS 455:2015', s3: 16, s7: 22, s28: 33, s28max: null, blaineMin: 225, so3Max: 3.5, mgoMax: 10, loiMax: 5, irMax: 4, ist: 30, fst: 600, leChatelier: 10, autoclave: 0.8, scm: 'GBFS 25–70%' },
  CC: { standard: 'IS 16415:2015', s3: 16, s7: 22, s28: 33, s28max: null, blaineMin: 300, so3Max: 3.5, mgoMax: 6, loiMax: 5, irMax: null, ist: 30, fst: 600, leChatelier: 10, autoclave: 0.8, scm: 'Fly ash 15–35% + GBFS 20–50%' },
};

/** Internal 28-day release target = BIS minimum + 3 MPa safety margin (KPI catalogue). */
const SAFETY_MPA = 3;

/** Typical commercial means (research Demo Simulation Guide) used as the simulated baseline. */
const GRADE_BASE = {
  'OPC 53': { s3: 34.5, s7: 44.8, s28: 58.2, blaine: 322, so3: 2.7, scm: 4, clinker: 0.92 },
  'OPC 43': { s3: 29.0, s7: 39.5, s28: 50.5, blaine: 305, so3: 2.5, scm: 4, clinker: 0.92 },
  PPC: { s3: 23.8, s7: 33.5, s28: 47.6, blaine: 352, so3: 2.6, scm: 30, clinker: 0.66 },
  PSC: { s3: 20.5, s7: 30.5, s28: 43.5, blaine: 368, so3: 2.4, scm: 58, clinker: 0.38 },
  CC: { s3: 21.5, s7: 31.0, s28: 44.0, blaine: 360, so3: 2.5, scm: 50, clinker: 0.47 },
};

function checkBatch(grade, b) {
  const s = BIS[grade];
  const checks = [
    { key: 'blaine', label: 'Fineness (Blaine)', value: b.blaine, unit: 'm²/kg', limit: `≥ ${s.blaineMin}`, pass: b.blaine >= s.blaineMin },
    { key: 'so3', label: 'SO₃', value: b.so3, unit: '%', limit: `≤ ${s.so3Max}`, pass: b.so3 <= s.so3Max },
    { key: 'ist', label: 'Initial setting', value: b.ist, unit: 'min', limit: `≥ ${s.ist}`, pass: b.ist >= s.ist },
    { key: 's3', label: '3-day strength', value: b.s3, unit: 'MPa', limit: `≥ ${s.s3}`, pass: b.s3 == null || b.s3 >= s.s3 },
    { key: 's7', label: '7-day strength', value: b.s7, unit: 'MPa', limit: `≥ ${s.s7}`, pass: b.s7 == null || b.s7 >= s.s7 },
    { key: 's28', label: '28-day strength', value: b.s28 ?? b.p28, unit: 'MPa', limit: s.s28max ? `${s.s28}–${s.s28max}` : `≥ ${s.s28}`,
      pass: (b.s28 ?? b.p28) >= s.s28 && (!s.s28max || (b.s28 ?? b.p28) <= s.s28max), predicted: b.s28 == null },
  ];
  return { checks, pass: checks.every((c) => c.pass) };
}

module.exports = { BIS, SAFETY_MPA, GRADE_BASE, checkBatch };
