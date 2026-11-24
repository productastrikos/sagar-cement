// The scenario library. Quality scenarios S1–S7 follow the research Demo
// Simulation Guide (cause → effect chains, evidence signals and operator
// actions), adapted to Sagar's plants. E1 is the strategy brief's
// "₹2.25/kVAh peak-tariff alarm" live moment.
//
// A scenario pushes biases into the simulation. Its level ramps 0 → 1 after it
// starts and falls back as people apply its recommended actions.

const { clamp } = require('./util');

const DEFS = {
  S1: {
    title: 'XRF calibration drift → LSF swing → high free lime',
    short: 'XRF drift → high free lime',
    domain: 'quality', plantType: 'integrated', plant: 'MTP', line: 'K2', severity: 'critical', confidence: 86,
    engine: 'S!aP quality rules + free-lime soft sensor v1.3',
    cause: 'Worn puck-mill grinding elements leave XRF pellets coarse, biasing CaO low (−0.45%). The raw-mix controller over-corrects, and over-limed meal reaches the kiln after the CF silo lag.',
    biases: {
      'lab:xrfCao': -0.45, 'lab:lsfTrue': 4.2, 'lab:fcao': 1.35, 'lab:c3s': -6.0, 'lab:litre': -105, 'lab:s28': -5.8, 'lab:s3': -3.8,
      'lab:crmDrift': 38, 't:KLN_TRQ_PCT': 7, 't:BZT': 9, 'k:q.fcaoInSpec': -24, 'k:q.fcaoSigma': 0.22, 'k:q.lsfSigma': 0.9,
      'k:l.crmDrift': 36, 'k:q.p28Risk': 3, 'k:e.shc': 9, 'k:q.c3s': -3,
    },
    evidence: [
      ['FACT', 'Cross-belt vs lab XRF CaO residual above +0.40% for 3 consecutive hourly samples.'],
      ['FACT', 'XRF certified-reference drift on CaO at 85% of the ASTM C114 limit.'],
      ['INFERENCE', 'Free-lime soft sensor forecasts f-CaO above 2.0% within 90 minutes; clinker litre weight falling below 1,140 g/L.'],
      ['INFERENCE', '28-day forecaster drops OPC 53 to about 52.4 ± 1.1 MPa — under the IS 269 minimum of 53 MPa.'],
    ],
    actions: [
      ['Lab chemist', 'Pause XRF-to-raw-mix bias transfer, run a fused-bead and CRM drift check, and replace the puck-mill grinding media'],
      ['CCR kiln operator', 'Trim kiln feed 5% and add 1–2% burning-zone fuel; route clinker above 2.2% f-CaO to the off-spec bin'],
      ['Cement mill engineer', 'Raise OPC 53 separator speed by 30–40 rpm on the affected lot and hold dispatch pending 7-day results'],
    ],
    impact: 18, route: '/quality',
  },
  S2: {
    title: 'CF silo aeration clogging → homogenisation collapse',
    short: 'CF silo homogenisation collapse',
    domain: 'process', plantType: 'integrated', plant: 'GDP', line: 'K1', severity: 'high', confidence: 81,
    engine: 'S!aP process rules v2.1',
    cause: 'Moisture from a faulty compressed-air dryer blinds fluidisation pads in sectors 2 and 5, creating dead zones. Kiln feed LSF variance triples and the kiln hunts.',
    biases: {
      'k:q.hFactor': -4.8, 'k:q.lsfSigma': 1.2, 't:BZT': -10, 't:CF1_BLWR_BAR': 0.08, 'lab:fcao': 0.6, 'k:q.fcaoSigma': 0.3,
      'k:q.fcaoInSpec': -18, 'k:e.shc': 22,
    },
    evidence: [
      ['FACT', 'Asymmetric chamber pressure across CF silo sectors 2 and 5, with aeration blower current up relative to discharge pressure.'],
      ['FACT', 'Rolling 24-hour homogenisation factor below 4.0 while raw-mill inlet LSF variance stays normal.'],
      ['INFERENCE', 'Kiln torque and free-lime soft-sensor swings are phase-locked to kiln-feed LSF waves at about 60 minutes lag.'],
    ],
    actions: [
      ['Maintenance lead', 'Inspect compressed-air dryers and raise a priority work order to clean the aeration pads on sectors 2 and 5'],
      ['Process engineer', 'Hold CF silo level at 60–75% and tighten the raw-mill cross-belt LSF deadband until the pads are restored'],
    ],
    impact: 9, route: '/quality',
  },
  S3: {
    title: 'High-sulphur petcoke + uncorrected calorimeter basis → cyclone build-up',
    short: 'High-S petcoke → cyclone build-up',
    domain: 'process', plantType: 'integrated', plant: 'JRB', line: 'K1', severity: 'high', confidence: 78,
    engine: 'S!aP data-quality rules + process rules v2.1',
    cause: 'A new petcoke rake carries 6.4% sulphur. The calorimeter auto-exported a preliminary air-dried GCV before sulphur and moisture correction, overstating NCV by about 380 kcal/kg.',
    biases: {
      'lab:hotSo3': 2.2, 'lab:calc': -7, 't:HOT_MEAL_CALC': -7, 't:PH_C5_DRFT': 60, 't:KI_CO': 0.025, 't:BZT': -45, 'lab:fcao': 1.4,
      'lab:fuelS': 2.6, 'k:q.fcaoInSpec': -20, 'k:e.shc': 16, 'k:d.rejectRate': 0.6,
    },
    evidence: [
      ['FACT', 'Calorimeter record ingested on preliminary ADB basis without sulphur correction; fuel S = 6.4% against a 4.0% blend cap.'],
      ['FACT', 'Hot-meal SO₃ above 3.5% with a narrowing C5 cone draft and rising preheater differential pressure.'],
      ['INFERENCE', 'Calciner CO excursions above 0.02% with hot-meal calcination under 87% and a falling burning-zone temperature.'],
    ],
    actions: [
      ['Lab chemist', 'Quarantine the preliminary calorimeter record, commit the corrected ARB NCV, and block preliminary auto-export in the lab system'],
      ['CCR kiln operator', 'Blend back coal to bring fuel sulphur under 3.8%, step up C5 air-cannon cadence, and hold kiln inlet O₂ at 2.0–2.5%'],
    ],
    impact: 11, route: '/field',
  },
  S4: {
    title: 'Grate cooler “red river” channelling → slow quench → delayed strength drop',
    short: 'Cooler red river → strength drop',
    domain: 'process', plantType: 'integrated', plant: 'DCP', line: 'K2', severity: 'high', confidence: 83,
    engine: 'S!aP cooler vision model v0.9 + process rules',
    cause: 'Fine clinker segregates to one lane; under-grate air fluidises it into a hot “red river”. Slow quenching lets alite revert to belite and free lime.',
    biases: {
      't:CLR_FC_RATIO': 3.2, 'c:cooler': 45, 't:CLR_SAT_C': -75, 't:CLR_CLK_EXIT': 65, 'lab:c3s': -3.5, 'lab:s28': -3.2,
      'k:p.coolerEff': -7, 'k:e.shc': 18, 'k:p.redRiver': 78, 'k:q.c3s': -2,
    },
    evidence: [
      ['FACT', 'Under-grate fine-to-coarse pressure ratio approaching 1:6 — a 5–10 minute lead before it is visible.'],
      ['FACT', 'Cooler thermal camera: bed variance spike and red-river probability above 0.85; fine-side clinker exit above 135 °C.'],
      ['FACT', 'Secondary air temperature down 50–80 °C with unchanged kiln feed and burner fuel.'],
      ['INFERENCE', 'Downstream XRD C₃S/C₂S drop of about 4% expected, with 28-day strength down about 3 MPa four days later.'],
    ],
    actions: [
      ['CCR cooler operator', 'Slow fine-side grate speed 0.3 m/min, trim the fine-side under-grate fan damper 5–8%, and thicken the zone 1 bed'],
      ['Kiln operator', 'Apply measured burning-zone fuel compensation for the lower secondary air temperature and taper back as the bed stabilises'],
    ],
    impact: 7, route: '/field',
  },
  S5: {
    title: 'Mill water-spray failure + hot clinker → gypsum dehydration → false set',
    short: 'Gypsum dehydration → false set',
    domain: 'quality', plantType: 'any', plant: 'MTP', line: 'CM1', severity: 'high', confidence: 80,
    engine: 'S!aP quality rules v1.8',
    cause: 'Scale plugs the second-compartment water nozzle while 118 °C clinker enters the mill. Mill exit temperature crosses the 120–130 °C gypsum dehydration threshold.',
    biases: { 'm:EXIT_TEMP': 22, 'm:SPRAY_LPH': -1450, 'lab:gypsumDehyd': 44, 'k:q.gypsumDehyd': 40, 'k:q.offSpec': 1.1 },
    evidence: [
      ['FACT', 'Mill exit cement temperature above 125 °C for more than 15 minutes, with water-spray flow 80% below setpoint.'],
      ['FACT', 'Cement XRD gypsum dehydration index above 65% while XRF SO₃ stays inside 2.6–2.9%.'],
      ['INFERENCE', 'Shift Vicat test likely to flag false set (IS 4031 Part 14) — ready-mix slump-loss claims if dispatched unchecked.'],
    ],
    actions: [
      ['Mill operator', 'Cut mill feed 10–15%, open the separator cooling-air bleed, switch to the standby water lance, and raise a descaling work order'],
      ['Quality manager', 'Route mill output to the secondary silo, verify false-set recovery, and blend at under 20% with cool cement before release'],
    ],
    impact: 6, route: '/quality',
  },
  S6: {
    title: 'GBFS quality drift (low glass, monsoon moisture) → PSC strength risk',
    short: 'GBFS drift → PSC strength risk',
    domain: 'quality', plantType: 'grinding', plant: 'JJP', line: 'CM1', severity: 'critical', confidence: 84,
    engine: 'S!aP 28-day strength forecaster v2.0 (gradient boosting)',
    cause: 'A wet slag rake (14% moisture) with glass content down to 81% overloads the VRM drier. Fineness slides and PSC strength heads for the IS 455 floor.',
    biases: {
      'g:SLAG_MOIST': 6, 'g:SLAG_GLASS': -12, 'lab:blaine': -38, 'lab:psdBand': -9, 'm:SEC': 3.2, 'lab:s28': -8.5, 'lab:s3': -4.5,
      'k:q.p28Risk': 4, 'k:q.offSpec': 1.4, 'k:e.grindPower': 3,
    },
    evidence: [
      ['FACT', 'Incoming slag: optical glass content 81% (below the 85% IS 16714 minimum) and moisture above 12%.'],
      ['FACT', 'VRM drying-gas demand up, vibration excursions, and laser PSD 3–30 µm fraction below 58% (Blaine under 335 m²/kg).'],
      ['INFERENCE', '28-day PSC forecast falls to about 34 MPa — within 1.1 MPa of the 33 MPa BIS floor; 3-day result at risk.'],
    ],
    actions: [
      ['Quality & grinding lead', 'Cut PSC slag from 60% to 48% and quarantine the low-glass rake for 1:3 blending with high-glass stock'],
      ['Mill operator', 'Raise hot-gas generator inlet temperature within baghouse limits and lift separator speed to restore Blaine to 365–375 m²/kg'],
      ['Procurement / QA', 'Issue a non-conformance notice to the slag supplier under IS 16714 glass-content requirements'],
    ],
    impact: 14, route: '/prediction',
  },
  S7: {
    title: 'Windows DCOM patch + full calorimeter log → silent pipeline stall',
    short: 'DCOM patch → pipeline stall',
    domain: 'data', plantType: 'integrated', plant: 'GDP', line: null, severity: 'critical', confidence: 97,
    engine: 'S!aP data-health monitor',
    cause: 'A Sunday patch tightened DCOM packet integrity on a lab workstation still using remote OPC DA (error 0x80070005). The calorimeter also hit its 1 MB datalog.csv ceiling and stopped logging.',
    biases: { 'conn:xrf': 1, 'conn:cal': 1, 'k:d.completeness': -6, 'k:d.freshness': 18, 'k:a.paused': 1 },
    evidence: [
      ['FACT', 'XRF-to-DCS OPC DA connector disconnected (staleness above 10 minutes) with DCOM error 0x80070005 in gateway diagnostics.'],
      ['FACT', 'Edge gateway buffer queue rising — local XRF capture is healthy while the upstream link is severed.'],
      ['FACT', 'Calorimeter file watcher: datalog.csv frozen at 1,024 KB with no growth across two scheduled fuel runs.'],
      ['INFERENCE', 'Free-lime soft sensor auto-paused (confidence under 80%) until completeness returns above 99.5%.'],
    ],
    actions: [
      ['OT data architect', 'Cut the remote OPC DA link over to the local DA-to-UA wrapper (TCP 4840) and verify the buffer replays to zero'],
      ['Lab support engineer', 'Run the archive-and-rotate script on the calorimeter datalog and confirm live NCV ingestion returns GOOD quality'],
    ],
    impact: 5, route: '/connectivity',
  },
  E1: {
    title: 'Peak-hour mill ramp → 15-minute MD breach forecast',
    short: 'Peak-hour MD breach forecast',
    domain: 'energy', plantType: 'any', plant: 'DCP', line: null, severity: 'critical', confidence: 92,
    engine: 'S!aP 15-min MD predictor + APERC tariff engine',
    cause: 'The cement mills and the raw mill ramp together inside the 18:00–22:00 peak window while the 30 MW CPP is non-operational, so all of it lands on the grid.',
    biases: { 'p:ramp': 1 },
    evidence: [],
    actions: [
      ['Energy manager', 'Shed Cement mill 2 now and reschedule its run into the 00:00–06:00 off-peak slot (₹4.65/kVAh)'],
      ['CCR shift in-charge', 'Hold the raw mill at 85% feed until the 15-minute window closes under 95% of contract demand'],
    ],
    impact: 21, route: '/power',
  },
};

const active = []; // { key, plant, line, startedAt, applied: Set, removing }
const RAMP_MS = 40 * 1000;

function start(key, plant, line) {
  const d = DEFS[key];
  if (!d) throw new Error(`Unknown scenario ${key}`);
  const p = plant || d.plant;
  const existing = active.find((a) => a.key === key && a.plant === p);
  if (existing) return existing;
  const s = { key, plant: p, line: line || d.line, startedAt: Date.now(), applied: new Set(), level: 0 };
  active.push(s);
  return s;
}

function stop(key, plant) {
  const i = active.findIndex((a) => a.key === key && (!plant || a.plant === plant));
  if (i >= 0) active.splice(i, 1);
}

/** Level 0..1: ramps up over RAMP_MS, then scales down with applied actions. */
function tick() {
  for (let i = active.length - 1; i >= 0; i--) {
    const s = active[i];
    const d = DEFS[s.key];
    const ramp = clamp((Date.now() - s.startedAt) / RAMP_MS, 0, 1);
    const target = ramp * (1 - s.applied.size / d.actions.length);
    s.level += (target - s.level) * 0.35;
    if (s.applied.size >= d.actions.length && s.level < 0.03) active.splice(i, 1);
  }
}

/** Sum of active biases for a target at a plant (and optionally a line). */
function bias(plant, line, target) {
  let v = 0;
  for (const s of active) {
    if (s.plant !== plant) continue;
    if (line && s.line && s.line !== line && !target.startsWith('k:')) continue;
    const b = DEFS[s.key].biases[target];
    if (b) v += b * s.level;
  }
  return v;
}

const isActive = (key, plant) => active.some((a) => a.key === key && (!plant || a.plant === plant) && a.level > 0.05);

module.exports = { DEFS, active, start, stop, tick, bias, isActive };
