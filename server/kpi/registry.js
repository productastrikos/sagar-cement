// Every KPI in the product. Thresholds come from the two research KPI
// catalogues (docs/). A KPI has a live source in the simulation where one
// exists; otherwise it is generated history plus scenario biases. Cards and the
// drawer both read values through this registry, so they always agree.

const { PLANTS, byId, cementTph } = require('../domain/plants');
const { BIS, SAFETY_MPA } = require('../domain/bis');
const SC = require('../sim/scenarios');
const PR = require('../sim/process');
const LAB = require('../sim/lab');
const CN = require('../sim/connectivity');
const PW = require('../sim/power');
const ADV = require('../sim/advisory');
const { mean, sd, round, clamp, hrand } = require('../sim/util');

/* ── Dimensions ─────────────────────────────────────────────────────────── */
const DIMS = {
  plant: { label: 'Plant' },
  kilnLine: { label: 'Kiln line', values: ['Line 1', 'Line 2'], shares: [0.42, 0.58] },
  mill: { label: 'Mill', values: ['Mill 1', 'Mill 2'], shares: [0.48, 0.52] },
  grade: { label: 'Grade', values: ['OPC 53', 'OPC 43', 'PPC', 'PSC', 'CC'], shares: [0.4, 0.13, 0.32, 0.09, 0.06] },
  shift: { label: 'Shift', values: ['Shift A', 'Shift B', 'Shift C'], shares: [0.34, 0.33, 0.33] },
  instrument: { label: 'Instrument', values: ['XRF', 'XRD', 'PSA / Blaine', 'Cross-belt', 'Calorimeter', 'Microscope', 'CTM'], shares: [0.34, 0.14, 0.16, 0.04, 0.06, 0.04, 0.22] },
  connector: { label: 'Connector type', values: ['Lab instruments', 'DCS & historian', 'Field & power meters', 'Cameras', 'SAP'], shares: [0.08, 0.6, 0.27, 0.04, 0.01] },
  stage: { label: 'Material stage', values: ['Raw meal', 'Kiln feed', 'Clinker', 'Cement', 'Fuel'], shares: [0.24, 0.2, 0.22, 0.28, 0.06] },
  section: { label: 'Section', values: ['Crusher', 'Raw mill', 'Coal mill', 'Kiln & preheater', 'Cooler', 'Cement mill', 'Utilities'], shares: [0.015, 0.21, 0.05, 0.17, 0.08, 0.4, 0.075] },
  energy: { label: 'Energy source', values: ['Grid', 'CPP', 'WHRS', 'Solar', 'Hydro'], shares: [0.46, 0.33, 0.14, 0.04, 0.03] },
  feeder: { label: 'Feeder', values: ['Raw mill', 'Kiln / PH fan', 'Cooler fans', 'Coal mill', 'Cement mill 1', 'Cement mill 2', 'Utilities'], shares: [0.21, 0.17, 0.08, 0.05, 0.2, 0.2, 0.09] },
  tod: { label: 'ToD slot', values: ['Peak', 'Normal', 'Solar', 'Off-peak'], shares: [0.3, 0.2, 0.3, 0.2] },
  domain: { label: 'Domain', values: ['Quality', 'Process', 'Energy', 'Data'], shares: [0.3, 0.25, 0.3, 0.15] },
};

/* ── Live helpers (memoised for 2 s — the dataset scans are not free) ──── */
const memo = {};
function m(key, fn) {
  const hit = memo[key];
  if (hit && Date.now() - hit.t < 2000) return hit.v;
  const v = fn(); memo[key] = { t: Date.now(), v }; return v;
}
const results30 = (pid) => m(`r30${pid}`, () => LAB.lab.batches.filter((b) => b.plant === pid && b.s28 != null && b.day >= 28 && b.day < 58));
const recent30 = (pid) => m(`b30${pid}`, () => LAB.lab.batches.filter((b) => b.plant === pid && b.day < 30).map(LAB.batchView));
const health = (pid) => m(`h${pid}`, () => CN.health(pid));
const dispatch = (pid, h) => m(`d${pid}${h}`, () => PW.dispatchDay(pid, h));
const advs = () => m('adv', () => ADV.list());
const lines = (pid) => PR.state[pid]?.lines || [];
/** Supply model at an hour of day — used so history follows the live model's daily shape. */
const supAt = (pid, hh) => { const p = byId[pid]; const st = PW.power[pid]; return PW.supplyAt(p, hh, PW.baseLoadMw(p), { pf: st.pf, solarPr: st.solarPr / 0.8 }); };
const fcaoPts = (pid) => lines(pid).flatMap((L) => L.fs.est.slice(-20).map((p) => p.v));

const PLANT_IDS = PLANTS.map((p) => p.id);
const INTEG = ['MTP', 'DCP', 'GDP', 'JRB'];

/* ── Definitions ────────────────────────────────────────────────────────── */
// th: [warn, crit] — compared in the bad direction (goodUp=false: ≥ is worse).
const KPIS = [
  /* Overview & production */
  { id: 'o.output', label: 'Cement output', unit: 'TPD', dp: 0, goodUp: true, kind: 'sum', grain: 'op', scope: 'all', dims: ['plant', 'grade', 'mill'],
    base: Object.fromEntries(PLANTS.map((p) => [p.id, cementTph(p) * 24])), sd: 600, hsd: 120, lo: 0,
    live: (pid) => PR.state[pid].cementTph * 24, th: null, icon: 'Factory', tone: 'accent', route: '/', cta: 'Open fleet overview',
    def: 'Cement ground across the selected plants, as a 24-hour rate from mill weighfeeders.', source: 'DCS weighfeeders via S!aP edge',
    recs: ['Check {top} mill availability against plan before the evening peak'] },
  { id: 'o.util', label: 'Capacity utilisation', unit: '%', dp: 1, goodUp: true, kind: 'rate', grain: 'op', scope: 'all', dims: ['plant', 'mill'],
    base: Object.fromEntries(PLANTS.map((p) => [p.id, p.util * 100])), sd: 1.5, hsd: 0.6, lo: 0, hi: 100, th: [60, 50],
    live: (pid) => (PR.state[pid].cementTph * 8760) / (byId[pid].cementMtpa * 1e6) * 100, icon: 'Gauge', tone: 'accent', route: '/', cta: 'Open fleet overview',
    def: 'Current cement output as a share of installed capacity (11.75 MTPA fleet).', source: 'DCS weighfeeders, FY27 capacity register',
    recs: ['Review {top} grinding schedule against dispatch orders'] },
  /* Energy */
  { id: 'e.sec', label: 'Electrical SEC', unit: 'kWh/t', dp: 1, goodUp: false, kind: 'rate', grain: 'op', scope: 'all', dims: ['plant', 'section', 'shift'],
    base: Object.fromEntries(PLANTS.map((p) => [p.id, p.secBase])), sd: 0.8, hsd: 0.6, th: [70, 75], live: (pid) => (PW.power[pid].loadMw * 1000) / PR.state[pid].cementTph,
    icon: 'Zap', tone: 'warning', route: '/energy', cta: 'Open energy scorecard', engine: 'S!aP SEC drift detector',
    def: 'Total plant electricity divided by cement produced. Sagar FY26: 72.83 kWh/t; FY27 target 70, FY30 target 65. CII top-10 under 67.', source: 'IEC 61850 / Modbus meters + DCS production',
    recs: ['Run a sectional SEC drift check on {top}’s cement mill circuit (separator efficiency, liner wear)', 'Benchmark {top} against its best month and CII v7.0 best-in-class by section'] },
  { id: 'e.shc', label: 'Thermal SHC', unit: 'kcal/kg', dp: 0, goodUp: false, kind: 'rate', grain: 'op', scope: 'integrated', dims: ['plant', 'kilnLine', 'shift'],
    base: Object.fromEntries(PLANTS.map((p) => [p.id, p.shcBase || 715])), sd: 3, hsd: 2.2, trend: 0.02, th: [700, 735],
    events: [{ plant: 'DCP', from: 120, to: 40, delta: 9 }], icon: 'Flame', tone: 'warning', route: '/energy', cta: 'Open energy scorecard', engine: 'S!aP kiln heat-balance model',
    def: 'Fuel heat input (coal + petcoke + AFR × NCV) per kg of clinker. H1 FY27: 710.68 kcal/kg; FY30 target 700; CII best 670.', source: 'Fuel weighfeeders + bomb calorimeter NCV + clinker production',
    recs: ['Check preheater false air and cooler recovery at {top} — each 1% false air costs about 3 kcal/kg', 'Verify calorimeter NCV basis (ARB, sulphur-corrected) before trusting the SHC trend at {top}'] },
  { id: 'e.green', label: 'Green power share', unit: '%', dp: 1, goodUp: true, kind: 'rate', grain: 'op', scope: 'all', dims: ['plant', 'energy', 'tod'],
    base: { MTP: 27, DCP: 5, GDP: 49, JRB: 27, BYV: 20, JJP: 0.2 }, sd: 1.2, hsd: 0.5, lo: 0, hi: 100, th: [35, 20],
    hourFn: (pid, hh) => { const s = supAt(pid, hh); return ((s.WHRS + s.Solar + s.Hydro) / s.load) * 100; },
    live: (pid) => { const s = PW.power[pid].supply; return ((s.WHRS + s.Solar + s.Hydro) / s.load) * 100; },
    icon: 'Leaf', tone: 'success', route: '/energy', cta: 'Open energy scorecard', engine: 'S!aP energy mix model',
    def: 'WHRS + captive solar + wheeled hydro as a share of plant electricity. H1 FY27: 21.0%; targets 24% (FY27) and 50% (FY30). Peers 34–56%.', source: 'WHRS/solar SCADA, ABT meters, wheeling statements',
    recs: ['Prioritise the 9 MW Dachepalli WHRS and Jeerabad 7 MW solar in the FY28 plan', 'Raise WHRS availability at {top} — boiler soot-blowing and AQC fouling checks'] },
  { id: 'e.powerCost', label: 'Blended power cost', unit: '₹/kWh', dp: 2, goodUp: false, kind: 'rate', grain: 'op', scope: 'all', dims: ['plant', 'energy', 'tod'],
    base: { MTP: 5.9, DCP: 5.6, GDP: 5.2, JRB: 6.0, BYV: 5.7, JJP: 4.9 }, sd: 0.06, hsd: 0.04, th: [5.3, 6.2],
    hourFn: (pid, hh) => { const s = supAt(pid, hh); return s.costRs / (s.load * 1000); },
    live: (pid) => { const s = PW.power[pid].supply; return s.costRs / (s.load * 1000); },
    icon: 'IndianRupee', tone: 'warning', route: '/dispatch', cta: 'Open ToD & dispatch', engine: 'S!aP merit-order optimiser',
    def: 'Σ(source MWh × marginal rate) ÷ total electricity, using FY 2026–27 state ToD tariffs. UltraTech Q2 FY26: ₹5.30/kWh.', source: 'Energy meters + state tariff engine',
    recs: ['Shift finish grinding at {top} out of peak slots into solar/off-peak hours', 'Review CPP dispatch at {top} against the hour’s grid rate'] },
  { id: 'e.pfCostT', label: 'Power & fuel cost', unit: '₹/t', dp: 0, goodUp: false, kind: 'rate', grain: 'rec', scope: 'all', dims: ['plant', 'energy', 'grade'],
    base: { MTP: 1710, DCP: 1840, GDP: 1760, JRB: 1750, BYV: 520, JJP: 560 }, sd: 14, phi: 0.9, th: [1250, 1478],
    icon: 'IndianRupee', tone: 'warning', route: '/energy', cta: 'Open energy scorecard',
    def: 'Power and fuel cost per tonne of cement. H1 FY27 group: ₹1,478/t. Management targets a ₹250–325/t structural cut.', source: 'SAP S/4HANA FI/CO + energy meters',
    recs: ['Combine ToD grinding shifts and PF correction at {top} — the two quickest ₹/t levers', 'Raise TSR at {top} toward the 15% FY27 target with AFR/syngas'] },
  { id: 'e.tsr', label: 'Substitution (TSR)', unit: '%', dp: 1, goodUp: true, kind: 'rate', grain: 'rec', scope: 'integrated', dims: ['plant', 'kilnLine', 'shift'],
    base: { MTP: 3.1, DCP: 1.2, GDP: 2.0, JRB: 3.8 }, sd: 0.25, phi: 0.9, lo: 0, hi: 60, th: [15, 5],
    icon: 'Recycle', tone: 'info', route: '/energy', cta: 'Open energy scorecard',
    def: 'Heat from alternative fuels and biomass/syngas as a share of kiln heat input. H1 FY27: 2.35%; FY27 target 15%, FY30 25%.', source: 'AFR belt weighers, syngas flowmeters, lab NCV',
    recs: ['Correlate AFR feed with free lime in real time at {top} before raising TSR', 'Extend the Mattampally syngas trial data into the burnability model'] },
  { id: 'e.co2', label: 'Scope 1+2 CO₂', unit: 'kg/t', dp: 0, goodUp: false, kind: 'rate', grain: 'rec', scope: 'all', dims: ['plant', 'grade'],
    base: { MTP: 650, DCP: 680, GDP: 660, JRB: 590, BYV: 470, JJP: 430 }, sd: 4, phi: 0.9, th: [542, 600],
    icon: 'Cloud', tone: 'neutral', route: '/energy', cta: 'Open energy scorecard',
    def: 'Scope 1 + 2 CO₂ per tonne of cementitious material, with clinker allocated to the grinding plant that uses it. FY27 target 542 kg/t; SBTi net zero 2050.', source: 'Fuel & electricity meters, emission factors (BRSR basis)',
    recs: ['Raise blended-cement share at {top} toward the 65–68% target', 'Cut clinker factor via safe strength-giveaway reduction (see Predict & optimise)'] },
  { id: 'e.whrs', label: 'WHRS generation', unit: 'kWh/t clk', dp: 1, goodUp: true, kind: 'rate', grain: 'op', plants: ['MTP', 'GDP', 'JRB'], dims: ['plant', 'shift'],
    base: { MTP: 14, GDP: 17.4, JRB: 21 }, sd: 0.8, hsd: 0.5, th: [35, 25],
    live: (pid) => { const p = byId[pid]; const clk = lines(pid).reduce((s, L) => s + L.clinkerTpd, 0) / 24; return (p.power.whrsMw * PW.power[pid].whrsFrac * 1000) / clk; },
    icon: 'Thermometer', tone: 'info', route: '/efficiency', cta: 'Open process efficiency', engine: 'S!aP WHRS performance model',
    def: 'Net WHRS generation per tonne of clinker. CII best-in-class 43 kWh/t (21.3% cycle efficiency). Sagar FY26 fleet ≈ 11.5 kWh/t from 54.7 GWh.', source: 'WHRS turbine meter + AQC/PH boiler DCS',
    recs: ['Investigate {top} WHRS availability — boiler fouling, AQC bypass and turbine trips', 'Couple boiler draft and PH fan VFD analytics at {top} (WHRS adds about 1.2 kWh/t fan power)'] },
  { id: 'e.clinkerPower', label: 'Clinkerisation SEC', unit: 'kWh/t clk', dp: 1, goodUp: false, kind: 'rate', grain: 'op', scope: 'integrated', dims: ['plant', 'section', 'shift'],
    base: { MTP: 47, DCP: 44, GDP: 52, JRB: 49 }, sd: 0.7, hsd: 0.5, th: [45, 52], icon: 'Zap', tone: 'warning', route: '/efficiency', cta: 'Open process efficiency',
    def: 'Electricity up to clinker (crusher, raw mill, coal mill, kiln, cooler, utilities) per tonne of clinker. India average 50; 6-stage best 41.4.', source: 'HT feeder meters + clinker weighers',
    recs: ['Target preheater fan power and false air at {top}', 'Check raw mill separator efficiency and differential pressure at {top}'] },
  { id: 'e.grindPower', label: 'Grinding power', unit: 'kWh/t', dp: 1, goodUp: false, kind: 'rate', grain: 'op', scope: 'all', dims: ['plant', 'mill', 'grade'],
    base: { MTP: 27.5, DCP: 26, GDP: 28.5, JRB: 22.8, BYV: 26, JJP: 30 }, sd: 0.5, hsd: 0.4, th: [24, 29], live: (pid) => PR.millTag(pid, 'SEC'),
    icon: 'Cog', tone: 'warning', route: '/efficiency', cta: 'Open process efficiency', engine: 'S!aP over-grinding monitor',
    def: 'Mill drive + separator + mill fan kWh per tonne of cement, Blaine-normalised. CII v7.0: VRM PPC 18.8, VRM OPC 22.3, VRM PSC 31.1.', source: 'Mill HT meters + DCS weighfeeders + lab Blaine',
    recs: ['Trim over-grinding at {top}: every 10 m²/kg of excess Blaine costs 2–3 kWh/t', 'Schedule a liner and media inspection on {top}’s ball mill'] },
  /* Power automation */
  { id: 'pw.md', label: 'Projected MD', unit: '% CMD', dp: 1, goodUp: false, kind: 'rate', grain: 'op', scope: 'all', dims: ['plant', 'feeder', 'tod'],
    base: { MTP: 46, DCP: 78, GDP: 22, JRB: 79, BYV: 80, JJP: 82 }, sd: 1.5, hsd: 1.5, lo: 0, hi: 200, th: [95, 100],
    hourFn: (pid, hh) => { const s = supAt(pid, hh); return ((s.Grid * 1000) / PW.power[pid].pf / byId[pid].power.cmdKva) * 100; },
    live: (pid) => PW.power[pid].projected, icon: 'Activity', tone: 'danger', ai: true, route: '/power', cta: 'Open power automation', engine: 'S!aP 15-min MD predictor',
    def: 'Rolling 15-minute demand projected to the end of the window, as % of sanctioned contract demand. Above 120% triggers energy surcharges in TG and AP.', source: 'Main incomer ABT / IEC 61850 relay meter',
    recs: ['Pre-arm a ranked mill-shedding sequence at {top} for the 18:00–22:00 peak', 'Stagger mill restarts at {top} so two large drives never start in the same window'] },
  { id: 'pw.pf', label: 'Power factor', unit: '', dp: 3, goodUp: true, kind: 'rate', grain: 'op', scope: 'all', dims: ['plant', 'feeder'],
    base: { default: 0.982, DCP: 0.972 }, sd: 0.002, hsd: 0.002, lo: 0.85, hi: 1, th: [0.98, 0.95], live: (pid) => PW.power[pid].pf,
    icon: 'Waves', tone: 'info', route: '/power', cta: 'Open power automation', engine: 'S!aP power-quality rules',
    def: 'Active ÷ apparent power at the main incomer. TG, AP and OD bill on kVAh, so every 0.01 drop raises unit charges about 1%; MP rebates up to 7% at unity.', source: 'Incomer and APFC panel multifunction meters',
    recs: ['Add a detuned APFC step at {top} and retune existing steps', 'Filter VFD harmonics at {top} so capacitor banks are not de-rated'] },
  { id: 'pw.thd', label: 'Voltage THD', unit: '%', dp: 1, goodUp: false, kind: 'rate', grain: 'op', scope: 'all', dims: ['plant', 'feeder'],
    base: { default: 2.5, DCP: 3.4 }, sd: 0.15, hsd: 0.12, lo: 0, th: [3, 5], live: (pid) => PW.power[pid].thdV,
    icon: 'AudioWaveform', tone: 'warning', route: '/power', cta: 'Open power automation',
    def: 'Total harmonic voltage distortion at the main bus (IEEE 519: under 3% at HV, 5% at LV). VFD-heavy ID fans and roller presses inject 5th/7th/11th/13th harmonics.', source: 'Class-A power quality analysers',
    recs: ['Install 5th/7th passive filters on {top}’s largest VFD feeders'] },
  { id: 'pw.peakShare', label: 'Peak-slot import', unit: '%', dp: 1, goodUp: false, kind: 'rate', grain: 'rec', scope: 'all', dims: ['plant', 'tod', 'feeder'],
    base: { MTP: 6, DCP: 34, GDP: 5, JRB: 36, BYV: 33, JJP: 26 }, sd: 1.2, phi: 0.9, lo: 0, hi: 100, th: [15, 30],
    live: (pid) => (ADV.effects.todAdopted[pid] ? dispatch(pid, 4).peakShareOpt : dispatch(pid, 0).peakShareBase),
    icon: 'Clock', tone: 'warning', route: '/dispatch', cta: 'Open ToD & dispatch',
    def: 'Grid energy drawn in peak ToD slots as a share of total grid import, for today’s schedule.', source: 'Utility ABT meter + mill feeder meters + state ToD calendar',
    recs: ['Adopt the ToD grinding schedule at {top}', 'Raise cement silo targets before 18:00 at {top}'] },
  { id: 'pw.loadFactor', label: 'Load factor', unit: '%', dp: 1, goodUp: true, kind: 'rate', grain: 'rec', scope: 'all', dims: ['plant', 'tod'],
    base: { MTP: 72, DCP: 84, GDP: 69, JRB: 82, BYV: 78, JJP: 81 }, sd: 0.8, phi: 0.9, lo: 0, hi: 100, th: [80, 60],
    icon: 'BatteryCharging', tone: 'info', route: '/power', cta: 'Open power automation',
    def: 'Monthly grid kWh ÷ (billing demand × PF × hours). Odisha EHT gets ₹0.30/kVAh above 80%; MP has a higher slab below 50%.', source: 'Utility ABT meter + EMS tariff tracker',
    recs: ['Flatten the load profile at {top} — fewer short peaks lift load factor and cut demand charges'] },
  { id: 'pw.trafo', label: 'Transformer load', unit: '%', dp: 1, goodUp: false, kind: 'rate', grain: 'op', scope: 'all', dims: ['plant'],
    base: { MTP: 37, DCP: 62, GDP: 18, JRB: 63, BYV: 64, JJP: 66 }, sd: 2, hsd: 2, lo: 0, hi: 150, th: [85, 100], live: (pid) => PW.power[pid].trafoLoad,
    icon: 'Plug', tone: 'info', route: '/power', cta: 'Open power automation',
    def: 'Main incomer transformer loading as % of rating, with winding temperature tracked alongside.', source: 'Transformer relay and winding temperature indicators',
    recs: ['Review {top} transformer cooling ahead of the summer peak'] },
  /* Dispatch */
  { id: 'ds.savings', label: 'ToD savings', unit: '₹ lakh/day', dp: 2, goodUp: true, kind: 'sum', grain: 'rec', scope: 'all', dims: ['plant', 'tod'],
    base: { MTP: 0.4, DCP: 1.6, GDP: 0.2, JRB: 1.4, BYV: 0.5, JJP: 0.2 }, sd: 0.05, phi: 0.95, lo: 0, th: null, ai: true,
    live: (pid) => (ADV.effects.todAdopted[pid] ? 0 : dispatch(pid, 4).savingsLakhDay), icon: 'Sparkles', tone: 'accent', route: '/dispatch', cta: 'Open ToD & dispatch', engine: 'S!aP merit-order optimiser',
    def: 'Savings from shifting 4 mill-hours a day out of peak slots into the cheapest slots, within mill headroom and silo buffer. Zero once a plant adopts the schedule.', source: 'S!aP dispatch optimiser on FY 2026–27 tariffs',
    recs: ['Adopt the ToD grinding schedule at {top} first — the largest daily saving'] },
  { id: 'ds.solarPr', label: 'Solar PR', unit: '%', dp: 1, goodUp: true, kind: 'rate', grain: 'rec', plants: ['MTP', 'DCP', 'GDP'], dims: ['plant', 'tod'],
    base: { MTP: 80, DCP: 81, GDP: 74 }, sd: 0.8, phi: 0.9, lo: 0, hi: 100, th: [78, 72], live: (pid) => PW.power[pid].solarPr * 100,
    icon: 'Sun', tone: 'warning', route: '/dispatch', cta: 'Open ToD & dispatch', engine: 'S!aP solar PR model',
    def: 'Actual AC output ÷ (DC capacity × plane-of-array irradiance / 1000). Under 78% usually means soiling or inverter derating.', source: 'Inverter SCADA + pyranometer',
    recs: ['Bring forward robotic panel cleaning at {top}'] },
  { id: 'ds.cppHeatRate', label: 'CPP gross heat rate', unit: 'kcal/kWh', dp: 0, goodUp: false, kind: 'rate', grain: 'rec', plants: ['MTP', 'GDP'], dims: ['plant', 'shift'],
    base: { MTP: 2960, GDP: 3040 }, sd: 12, phi: 0.9, th: [2950, 3100], icon: 'Flame', tone: 'warning', route: '/dispatch', cta: 'Open ToD & dispatch',
    def: 'CPP fuel × GCV ÷ gross units generated. CII range 2,950–3,100 kcal/kWh.', source: 'CPP boiler DCS, coal feeders, lab GCV, generator ABT meter',
    recs: ['Run {top} CPP only when the grid rate is above its ₹6.9/kWh marginal cost'] },
  { id: 'ef.phFan', label: 'PH fan power', unit: 'kWh/t clk', dp: 2, goodUp: false, kind: 'rate', grain: 'op', scope: 'integrated', dims: ['plant', 'kilnLine'],
    base: { MTP: 5.4, DCP: 5.0, GDP: 6.6, JRB: 6.1 }, sd: 0.12, hsd: 0.1, th: [5, 7.5], icon: 'Fan', tone: 'warning', route: '/efficiency', cta: 'Open process efficiency',
    def: 'Preheater ID fan kWh per tonne of clinker. 6-stage with WHRS best 4.6; Dachepalli fell from 13 to 5 after its ILC upgrade.', source: 'MV VFD drive meter + DCS',
    recs: ['Seal preheater doors and expansion joints at {top} to cut false air and fan load'] },
  /* Process & field */
  { id: 'p.clinker', label: 'Clinker output', unit: 'TPD', dp: 0, goodUp: true, kind: 'sum', grain: 'op', scope: 'integrated', dims: ['plant', 'kilnLine'],
    base: { MTP: 7440, DCP: 6510, GDP: 2790, JRB: 2790 }, sd: 90, hsd: 40, lo: 0, live: (pid) => lines(pid).reduce((s, L) => s + L.clinkerTpd, 0),
    icon: 'Factory', tone: 'accent', route: '/field', cta: 'Open field & vision',
    def: 'Clinker produced across kiln lines as a 24-hour rate (kiln feed ÷ 1.55 raw-meal factor).', source: 'Kiln feed weighfeeders (DCS)',
    recs: ['Check {top} kiln torque and feed stability'] },
  { id: 'p.shell', label: 'Shell hotspot', unit: '°C', dp: 1, goodUp: false, kind: 'rate', grain: 'op', scope: 'integrated', dims: ['plant', 'kilnLine'],
    base: 4, sd: 1.2, hsd: 1, lo: -10, th: [10, 20], live: (pid) => Math.max(...lines(pid).map((L) => L.cams.shell.v)),
    icon: 'ScanLine', tone: 'warning', route: '/field', cta: 'Open field & vision',
    def: 'Hottest kiln shell zone above its own baseline, from the infrared shell scanner. Above +20 °C points to coating loss or thin refractory.', source: 'Kiln shell scanner (edge features)',
    recs: ['Inspect coating at {top}’s hottest zone and review flame shape'] },
  { id: 'p.falseAir', label: 'False air', unit: '%', dp: 1, goodUp: false, kind: 'rate', grain: 'op', scope: 'integrated', dims: ['plant', 'kilnLine'],
    base: 6, sd: 0.4, hsd: 0.3, lo: 0, th: [5, 10], live: (pid) => PR.avgTag(pid, 'FALSE_AIR'),
    icon: 'Wind', tone: 'warning', route: '/efficiency', cta: 'Open process efficiency', engine: 'S!aP false-air tracker',
    def: 'Air ingress across the preheater from ΔO₂: (O₂ out − O₂ in) ÷ (21 − O₂ out) × 100. About 3 kcal/kg penalty per 1%.', source: 'Kiln inlet and preheater exit gas analysers',
    recs: ['Seal C4/C5 inspection doors and replace worn flap valves at {top}'] },
  { id: 'p.coolerEff', label: 'Cooler recovery', unit: '%', dp: 1, goodUp: true, kind: 'rate', grain: 'op', scope: 'integrated', dims: ['plant', 'kilnLine'],
    base: { MTP: 74.8, DCP: 76, GDP: 72.5, JRB: 73.6 }, sd: 0.5, hsd: 0.4, lo: 40, hi: 90, th: [74, 68],
    icon: 'Snowflake', tone: 'info', route: '/efficiency', cta: 'Open process efficiency',
    def: 'Heat recovered to secondary, tertiary and WHRS air as a share of hot clinker heat. Modern grate coolers 75–78%.', source: 'DCS thermocouples, airflow transmitters',
    recs: ['Tune grate speed and under-grate fan profile at {top}'] },
  { id: 'p.coalCo', label: 'Coal mill CO', unit: 'ppm', dp: 0, goodUp: false, kind: 'rate', grain: 'op', scope: 'integrated', dims: ['plant'],
    base: 40, sd: 3, hsd: 4, lo: 0, th: [60, 100], live: (pid) => PR.avgTag(pid, 'CM_CO_PPM'),
    icon: 'AlertTriangle', tone: 'danger', route: '/field', cta: 'Open field & vision',
    def: 'CO at the coal mill bag filter — the early fire signal. 100 ppm alerts, 500 ppm trips.', source: 'Coal mill safety gas analyser',
    recs: ['Check coal mill outlet temperature and inerting at {top}'] },
  { id: 'p.redRiver', label: 'Red-river risk', unit: '%', dp: 0, goodUp: false, kind: 'rate', grain: 'op', scope: 'integrated', dims: ['plant', 'kilnLine'],
    base: 9, sd: 2, hsd: 2, lo: 0, hi: 100, th: [40, 85], ai: true,
    live: (pid) => clamp(Math.max(...lines(pid).map((L) => ((L.cams.cooler.v - 22) / 48) * 100 + (L.tags.find((t) => t.code === 'CLR_FC_RATIO').v - 2.6) * 18)), 0, 100),
    icon: 'Camera', tone: 'warning', route: '/field', cta: 'Open field & vision', engine: 'S!aP cooler vision model v0.9',
    def: 'Probability of a fluidised "red river" on the grate, from cooler-camera bed variance and the fine-to-coarse under-grate pressure ratio.', source: 'Cooler thermal camera (edge AI) + under-grate pressures',
    recs: ['Slow fine-side grate speed and trim the fine-side fan at {top}'] },
  /* Quality */
  { id: 'q.bis28', label: '28-day pass rate', unit: '%', dp: 1, goodUp: true, kind: 'rate', grain: 'rec', scope: 'all', dims: ['plant', 'grade', 'mill'],
    base: { default: 100, MTP: 99.5 }, sd: 0.3, phi: 0.95, lo: 80, hi: 100, th: [99.9, 99],
    events: [{ plant: 'MTP', from: 18, to: 0, delta: -4 }],
    live: (pid) => { const r = results30(pid); if (!r.length) return 100; return (r.filter((b) => b.s28 >= BIS[b.grade].s28 && (!BIS[b.grade].s28max || b.s28 <= BIS[b.grade].s28max)).length / r.length) * 100; },
    icon: 'ShieldCheck', tone: 'success', route: '/prediction', cta: 'Open predict & optimise',
    def: 'Batches whose 28-day mortar strength met the BIS minimum (IS 269 / 1489 / 455 / 16415), over results received in the last 30 days.', source: 'CTM results via S!aP lab connector',
    recs: ['Trace failing {top} batches back through genealogy to their clinker lots', 'Tighten the release rule at {top}: hold dispatch when the 28-day forecast is under BIS + 1.5 MPa'],
    records: (f) => batchRecords(f, (b) => b.s28 != null && b.day >= 28 && b.day < 58 && b.s28 < BIS[b.grade].s28) },
  { id: 'q.giveaway', label: 'Strength giveaway', unit: 'MPa', dp: 1, goodUp: false, kind: 'rate', grain: 'rec', scope: 'all', dims: ['plant', 'grade'],
    base: { MTP: 5.2, DCP: 6.4, GDP: 6.1, JRB: 9.6, BYV: 8.4, JJP: 6.8 }, sd: 0.3, phi: 0.9, th: [4, 8], ai: true,
    live: (pid) => { const r = results30(pid); return r.length ? mean(r.map((b) => b.s28 - (BIS[b.grade].s28 + SAFETY_MPA))) : null; },
    icon: 'Scale', tone: 'warning', route: '/prediction', cta: 'Open predict & optimise', engine: 'S!aP 28-day strength forecaster v2.0',
    def: 'Mean 28-day strength minus the release target (BIS minimum + 3 MPa) over the last 30 results. Indian plants routinely ship 5–15 MPa above BIS.', source: 'CTM results + forecaster',
    recs: ['Trial a 3% higher SCM share on {top}’s blended grades with daily 3-day checks', 'Lower OPC Blaine targets at {top} where the forecast keeps a 2 MPa margin'] },
  { id: 'q.sigma28', label: '28-day strength σ', unit: 'MPa', dp: 2, goodUp: false, kind: 'rate', grain: 'rec', scope: 'all', dims: ['plant', 'grade', 'mill'],
    base: { default: 1.45, MTP: 1.9, JJP: 1.7 }, sd: 0.06, phi: 0.9, lo: 0, th: [1.5, 2.2],
    live: (pid) => { const r = results30(pid); const byG = {}; r.forEach((b) => (byG[b.grade] = byG[b.grade] || []).push(b.s28)); const v = Object.values(byG).filter((a) => a.length > 3).map(sd); return v.length ? mean(v) : null; },
    icon: 'Sigma', tone: 'warning', route: '/quality', cta: 'Open quality workbench',
    def: 'Rolling 30-result standard deviation of 28-day strength, averaged across grades. Lower variance is what lets the giveaway come down.', source: 'CTM results',
    recs: ['Reduce kiln feed LSF variance at {top} — it is the largest upstream driver of strength scatter'] },
  { id: 'q.fcaoInSpec', label: 'Free lime in spec', unit: '%', dp: 1, goodUp: true, kind: 'rate', grain: 'op', scope: 'integrated', dims: ['plant', 'kilnLine', 'shift'],
    base: 92, sd: 2.5, hsd: 3, lo: 0, hi: 100, th: [90, 80],
    live: (pid) => { const pts = fcaoPts(pid); return pts.length ? (pts.filter((v) => v >= 0.5 && v <= 1.5).length / pts.length) * 100 : null; },
    icon: 'FlaskConical', tone: 'success', route: '/quality', cta: 'Open quality workbench', engine: 'S!aP free-lime soft sensor v1.3',
    def: 'Share of free-lime readings (1-minute soft sensor, lab-calibrated) inside the 0.5–1.5% band over the last 20 minutes, across kiln lines.', source: 'XRD / wet lab + free-lime soft sensor',
    recs: ['Check kiln feed LSF stability and burning-zone fuel at {top}', 'Verify the XRF calibration standard at {top} if free lime and LSF disagree'] },
  { id: 'q.fcaoSigma', label: 'Free lime σ', unit: '%', dp: 2, goodUp: false, kind: 'rate', grain: 'op', scope: 'integrated', dims: ['plant', 'kilnLine', 'shift'],
    base: 0.24, sd: 0.02, hsd: 0.03, lo: 0, th: [0.3, 0.45],
    live: (pid) => { const v = lines(pid).map((L) => sd(L.fs.est.slice(-20).map((p) => p.v))); return v.length ? Math.max(...v) * 1.6 : null; },
    icon: 'Sigma', tone: 'info', route: '/quality', cta: 'Open quality workbench',
    def: 'Standard deviation of clinker free lime (worst kiln line). Under 0.30% is well controlled.', source: 'XRD / lab + soft sensor',
    recs: ['Investigate homogenisation and fuel feed stability at {top}'] },
  { id: 'q.lsfSigma', label: 'Kiln feed LSF σ', unit: '', dp: 2, goodUp: false, kind: 'rate', grain: 'op', scope: 'integrated', dims: ['plant', 'kilnLine', 'stage'],
    base: { default: 0.66, DCP: 0.74 }, sd: 0.04, hsd: 0.05, lo: 0, th: [0.8, 1.2], icon: 'Sigma', tone: 'info', route: '/quality', cta: 'Open quality workbench',
    def: 'Rolling 24-hour standard deviation of kiln feed LSF (target under 1.0, ideally under 0.8).', source: 'Lab XRF + cross-belt analyser',
    recs: ['Tighten the cross-belt LSF deadband on {top}’s raw-mix controller', 'Check CF silo aeration and level at {top}'] },
  { id: 'q.hFactor', label: 'Homogenisation factor', unit: '×', dp: 1, goodUp: true, kind: 'rate', grain: 'op', scope: 'integrated', dims: ['plant', 'kilnLine'],
    base: 7.4, sd: 0.3, hsd: 0.25, lo: 1, th: [6, 4], icon: 'Layers', tone: 'info', route: '/quality', cta: 'Open quality workbench',
    def: 'CF silo blending effect: σ(raw meal LSF in) ÷ σ(kiln feed LSF out). Design 5:1 to 10:1.', source: 'Raw meal and kiln feed XRF',
    recs: ['Inspect aeration pads and blower air dryers at {top}', 'Keep {top} CF silo level at 60–75%'] },
  { id: 'q.c3s', label: 'Clinker alite (C₃S)', unit: '%', dp: 1, goodUp: true, kind: 'rate', grain: 'op', scope: 'integrated', dims: ['plant', 'kilnLine'],
    base: 60.5, sd: 0.8, hsd: 0.7, th: [56, 52], icon: 'Atom', tone: 'accent', route: '/quality', cta: 'Open quality workbench',
    def: 'Alite by XRD Rietveld. Drives 1–28 day strength; 55–65% is the working band.', source: 'Automated XRD',
    recs: ['Check burning-zone temperature and cooler quench at {top}'] },
  { id: 'q.gypsumDehyd', label: 'Gypsum dehydration', unit: '%', dp: 0, goodUp: false, kind: 'rate', grain: 'op', scope: 'all', dims: ['plant', 'mill', 'grade'],
    base: 33, sd: 2, hsd: 2.5, lo: 0, hi: 100, th: [45, 65], icon: 'Droplets', tone: 'warning', route: '/quality', cta: 'Open quality workbench',
    def: 'Hemihydrate ÷ (dihydrate + hemihydrate) by cement XRD. Above 65% risks false set.', source: 'Cement XRD Rietveld',
    recs: ['Check mill water-spray flow and clinker inlet temperature at {top}'] },
  { id: 'q.offSpec', label: 'Off-spec batches', unit: '%', dp: 2, goodUp: false, kind: 'rate', grain: 'rec', scope: 'all', dims: ['plant', 'grade', 'stage'],
    base: { default: 0.3, MTP: 1.2, JJP: 2.3 }, sd: 0.08, phi: 0.9, lo: 0, th: [0.5, 2],
    live: (pid) => { const r = recent30(pid); return r.length ? (r.filter((b) => !b.bisPass).length / r.length) * 100 : null; },
    icon: 'XOctagon', tone: 'danger', route: '/prediction', cta: 'Open predict & optimise',
    def: 'Batches ground in the last 30 days that breach any BIS or internal limit (measured, or forecast where results are pending).', source: 'LIMS + S!aP quality rules engine',
    recs: ['Quarantine and re-blend at-risk {top} silos before dispatch'], records: (f) => batchRecords(f, (b) => !b.bisPass, true) },
  { id: 'q.p28Risk', label: 'Batches at risk', unit: '', dp: 0, goodUp: false, kind: 'sum', grain: 'rec', scope: 'all', dims: ['plant', 'grade'],
    base: { default: 0, JJP: 2 }, sd: 0.3, phi: 0.9, lo: 0, th: [1, 3], ai: true,
    live: (pid) => recent30(pid).filter((b) => b.s28 == null && b.atRisk).length,
    icon: 'Sparkles', tone: 'danger', route: '/prediction', cta: 'Open predict & optimise', engine: 'S!aP 28-day strength forecaster v2.0',
    def: 'Open batches (28-day result pending) whose forecast is under the BIS minimum + 1.5 MPa.', source: 'Strength forecaster on chemistry, PSD and early strength',
    recs: ['Hold {top} at-risk silos and confirm with the 7-day result'], records: (f) => batchRecords(f, (b) => b.s28 == null && b.atRisk, true) },
  { id: 'q.strengthMae', label: 'Forecast error', unit: 'MPa', dp: 2, goodUp: false, kind: 'rate', grain: 'rec', scope: 'all', dims: ['plant', 'grade'],
    base: 0.78, sd: 0.04, phi: 0.9, lo: 0, th: [1, 1.5], ai: true,
    live: (pid) => { const r = LAB.lab.batches.filter((b) => b.plant === pid && b.s28 != null && b.day < 90); return r.length ? mean(r.map((b) => Math.abs(b.p28 - b.s28))) : null; },
    icon: 'Target', tone: 'accent', route: '/prediction', cta: 'Open predict & optimise', engine: 'S!aP 28-day strength forecaster v2.0',
    def: 'Mean absolute error of the 28-day forecast against measured results, scored on a strict chronological split (never random). Published plant studies: 0.8–1.15 MPa.', source: 'Forecaster backtest',
    recs: ['Retrain the {top} model when the fuel or quarry regime changes'] },
  { id: 'q.softSensorErr', label: 'Soft sensor error', unit: '% f-CaO', dp: 2, goodUp: false, kind: 'rate', grain: 'op', scope: 'integrated', dims: ['plant', 'kilnLine'],
    base: 0.19, sd: 0.015, hsd: 0.02, lo: 0, th: [0.25, 0.35], ai: true, icon: 'Sparkles', tone: 'accent', route: '/prediction', cta: 'Open predict & optimise', engine: 'S!aP free-lime soft sensor v1.3',
    def: 'Mean absolute error of the 1-minute free-lime soft sensor against lab results. Target under 0.25%.', source: 'Soft sensor vs XRD/wet lab',
    recs: ['Recalibrate the {top} soft sensor against the last 20 lab results'] },
  { id: 'q.clinkerFactor', label: 'Clinker factor', unit: '', dp: 3, goodUp: false, kind: 'rate', grain: 'rec', scope: 'all', dims: ['plant', 'grade'],
    base: { MTP: 0.80, DCP: 0.79, GDP: 0.82, JRB: 0.70, BYV: 0.55, JJP: 0.46 }, sd: 0.004, phi: 0.95, lo: 0.3, hi: 1, th: [0.7, 0.75],
    icon: 'PieChart', tone: 'info', route: '/genealogy', cta: 'Open material genealogy',
    def: 'Clinker consumed ÷ cement produced. India average 0.73; Sagar targets about 0.64 by FY30 via blended cement.', source: 'DCS weighfeeders + SAP',
    recs: ['Shift {top} product mix toward PPC/PSC where demand allows'] },
  /* Lab */
  { id: 'l.tat', label: 'Lab turnaround', unit: 'min', dp: 0, goodUp: false, kind: 'rate', grain: 'op', scope: 'all', dims: ['plant', 'instrument', 'shift'],
    base: 24, sd: 2, hsd: 2, lo: 1, th: [30, 60],
    live: (pid) => { const s = LAB.lab.samples.filter((x) => x.plant === pid && x.instrument !== 'cba').slice(0, 25); return s.length ? mean(s.map((x) => x.tatMin)) : null; },
    icon: 'Timer', tone: 'info', route: '/lab', cta: 'Open lab integration',
    def: 'Analysed time minus sampled time for routine samples (barcode chain of custody).', source: 'Lab file watchers + LIMS timestamps',
    recs: ['Move {top} XRF/XRD exports from manual transfer to the file watcher'], records: (f) => sampleRecords(f) },
  { id: 'l.adherence', label: 'Schedule adherence', unit: '%', dp: 1, goodUp: true, kind: 'rate', grain: 'rec', scope: 'all', dims: ['plant', 'stage', 'shift'],
    base: { default: 97.8, JJP: 95.6 }, sd: 0.4, phi: 0.9, lo: 0, hi: 100, th: [97, 92], icon: 'CalendarCheck', tone: 'success', route: '/lab', cta: 'Open lab integration',
    def: 'Scheduled BIS and process samples completed on time as a share of planned.', source: 'LIMS schedule',
    recs: ['Rebalance {top} night-shift sampling load'] },
  { id: 'l.crmDrift', label: 'Calibration drift', unit: '% limit', dp: 0, goodUp: false, kind: 'rate', grain: 'op', scope: 'all', dims: ['plant', 'instrument'],
    base: 38, sd: 3, hsd: 2, lo: 0, hi: 120, th: [50, 80],
    live: (pid) => Math.max(...Object.entries(LAB.lab.crm).filter(([k]) => k.startsWith(pid)).map(([, v]) => v)),
    icon: 'Crosshair', tone: 'warning', route: '/lab', cta: 'Open lab integration',
    def: 'Worst instrument |measured CRM − certified value| as % of the ASTM C114 tolerance. Above 80% means recalibrate.', source: 'XRF / XRD / calorimeter QC logs',
    recs: ['Run a certified-reference check on {top}’s XRF and replace pellet-press grinding media'] },
  { id: 'l.cubeCv', label: 'Cube repeatability', unit: '% CV', dp: 1, goodUp: false, kind: 'rate', grain: 'rec', scope: 'all', dims: ['plant', 'instrument', 'shift'],
    base: { default: 2.4, BYV: 2.9 }, sd: 0.15, phi: 0.9, lo: 0, th: [3, 5], icon: 'Boxes', tone: 'info', route: '/lab', cta: 'Open lab integration',
    def: 'Within-set coefficient of variation of the three mortar cubes (IS 4031 Part 6). Above 5% re-test.', source: 'CTM console',
    recs: ['Check {top} curing temperature/humidity logging and cube moulds'] },
  { id: 'l.samples', label: 'Samples analysed', unit: '/h', dp: 0, goodUp: true, kind: 'sum', grain: 'op', scope: 'all', dims: ['plant', 'instrument', 'stage'],
    base: { MTP: 31, DCP: 27, GDP: 22, JRB: 23, BYV: 10, JJP: 9 }, sd: 1.5, hsd: 2.5, diurnal: ['day', 2], lo: 0, icon: 'TestTube', tone: 'accent', route: '/lab', cta: 'Open lab integration',
    def: 'Lab results landing in S!aP per hour across all connected instruments.', source: 'S!aP lab connectors',
    recs: ['Connect {top}’s remaining manual instruments via serial gateways'] },
  /* Data health */
  ...[
    ['d.completeness', 'Data completeness', '%', 2, true, 99.85, [99, 95], 'Database', 'success', 'Expected tag and sample intervals received with GOOD quality.', (pid) => health(pid).completeness, 0, 100],
    ['d.latency', 'Latency p95', 's', 1, false, 6.5, [15, 60], 'Timer', 'info', '95th percentile of ingested time minus source time for OT streams.', (pid) => health(pid).latency, 0, 600],
    ['d.freshness', 'Max staleness', 'min', 1, false, 1.2, [2, 10], 'Clock', 'info', 'Now minus the newest GOOD-quality timestamp, worst OT stream; stalled lab connectors count as 12 min+.', (pid) => health(pid).freshness, 0, 600],
    ['d.rejectRate', 'Validation rejects', '%', 2, false, 0.16, [0.5, 2], 'ShieldAlert', 'warning', 'Records held by closure, barcode, plausibility, basis or clock rules ÷ records ingested.', (pid) => health(pid).rejectRate, 0, 100],
    ['d.dupRate', 'Duplicate records', '%', 3, false, 0.03, [0.1, 1], 'Copy', 'info', 'Duplicate primary-key payloads dropped ÷ received (plant, instrument, sample, parameter, analysed time).', (pid) => health(pid).dupRate, 0, 100],
    ['d.uptime', 'Connector uptime', '%', 2, true, 99.86, [99.5, 98], 'Radio', 'success', 'Minutes each connector was online with its buffer under 50% ÷ total minutes.', (pid) => health(pid).uptime, 0, 100],
  ].map(([id, label, unit, dp, goodUp, base, th, icon, tone, def, live, lo, hi]) => ({
    id, label, unit, dp, goodUp, kind: 'rate', grain: 'op', scope: 'all', dims: ['plant', 'connector'], base, sd: Math.abs(base) * 0.01 + 0.02, hsd: Math.abs(base) * 0.01 + 0.02,
    lo, hi, th, icon, tone, live, def, source: 'S!aP edge gateways and ingestion pipeline', route: '/connectivity', cta: 'Open connectivity & data health', engine: 'S!aP data-health monitor',
    recs: ['Review {top}’s weakest connector and its edge gateway diagnostics', 'Move any remote OPC DA link at {top} behind a local DA-to-UA wrapper'],
    records: (f) => connectorRecords(f),
  })),
  { id: 'd.buffer', label: 'Edge buffer depth', unit: 'records', dp: 0, goodUp: false, kind: 'sum', grain: 'op', scope: 'all', dims: ['plant'],
    base: 3, sd: 1, hsd: 2, lo: 0, th: [50, 500], live: (pid) => health(pid).buffer, icon: 'HardDrive', tone: 'info', route: '/connectivity', cta: 'Open connectivity & data health', engine: 'S!aP data-health monitor',
    def: 'Records waiting in the plant edge gateway’s disk-backed store-and-forward queue. Rises during WAN outages and drains on reconnect — nothing is lost.', source: 'Edge gateway agents',
    recs: ['Check the {top} WAN link if the buffer keeps growing'] },
  { id: 'd.genealogy', label: 'Genealogy match', unit: '%', dp: 1, goodUp: true, kind: 'rate', grain: 'op', scope: 'all', dims: ['plant', 'stage'],
    base: 98.4, sd: 0.3, hsd: 0.2, lo: 0, hi: 100, th: [98, 95], live: (pid) => clamp(97.6 + (health(pid).completeness - 99) * 0.9 - (SC.isActive('S7', pid) ? 4 : 0), 80, 99.9),
    icon: 'GitBranch', tone: 'success', route: '/genealogy', cta: 'Open material genealogy',
    def: 'Lab samples whose barcode resolves to a material lot and an aligned process window.', source: 'S!aP genealogy engine',
    recs: ['Enforce barcode scanning at {top} sample points still using free-text names'] },
  { id: 'g.lots', label: 'Material lots tracked', unit: '', dp: 0, goodUp: true, kind: 'sum', grain: 'rec', scope: 'all', dims: ['plant', 'stage'],
    base: { MTP: 168, DCP: 152, GDP: 96, JRB: 101, BYV: 58, JJP: 52 }, sd: 4, phi: 0.8, lo: 0, icon: 'Boxes', tone: 'accent', route: '/genealogy', cta: 'Open material genealogy',
    def: 'Active lots in the genealogy graph (limestone piles, raw meal, kiln feed, clinker, SCM, cement silos, rakes).', source: 'S!aP genealogy engine', recs: ['Add {top} rail rakes to the lot registry'] },
  { id: 'g.residence', label: 'Clinker-to-dispatch', unit: 'days', dp: 1, goodUp: false, kind: 'rate', grain: 'rec', scope: 'all', dims: ['plant'],
    base: { MTP: 2.3, DCP: 2.6, GDP: 2.1, JRB: 2.4, BYV: 9.4, JJP: 11.2 }, sd: 0.15, phi: 0.9, lo: 0, th: [5, 12], icon: 'Truck', tone: 'info', route: '/genealogy', cta: 'Open material genealogy',
    def: 'Mass-weighted time from clinker formation to cement dispatch. Grinding units include rail transit.', source: 'Genealogy engine (lot transfers, rail manifests)', recs: ['Shorten {top} clinker stock cover where silo space allows'] },
  /* Advisory */
  ...[
    ['a.open', 'Open advisories', '', false, 'Sparkles', 'accent', (pid) => advs().filter((a) => a.plant === pid && a.status === 'open').length, { default: 1 }, null],
    ['a.critical', 'Critical & high', '', false, 'AlertTriangle', 'danger', (pid) => advs().filter((a) => a.plant === pid && a.status === 'open' && ['critical', 'high'].includes(a.severity)).length, { default: 0.4 }, [1, 3]],
    ['a.applied', 'Actions applied', '', true, 'CheckCircle2', 'success', (pid) => advs().filter((a) => a.plant === pid).reduce((s, a) => s + a.actions.filter((x) => x.applied).length, 0) + Math.round(hrand(`ap${pid}`) * 4), { default: 2 }, null],
    ['a.impact', 'Impact found', '₹ lakh/mo', true, 'IndianRupee', 'accent', (pid) => advs().filter((a) => a.plant === pid && a.status === 'open').reduce((s, a) => s + (a.impactLakh || 0), 0), { default: 12 }, null],
  ].map(([id, label, unit, goodUp, icon, tone, live, base, th]) => ({
    id, label, unit, dp: id === 'a.impact' ? 1 : 0, goodUp, kind: 'sum', grain: 'op', scope: 'all', dims: ['plant', 'domain'], base, sd: 0.3, hsd: 0.4, lo: 0, th, ai: true,
    icon, tone, live, def: id === 'a.impact' ? 'Monthly ₹ impact of open advisories (estimates, before verification).' : 'AI advisories from the S!aP rules, soft sensors and forecasters, by plant.',
    source: 'S!aP advisory engine', route: '/advisory', cta: 'Open AI advisory', engine: 'S!aP advisory engine', recs: ['Work {top}’s top-ranked advisory first'], records: (f) => advisoryRecords(f),
  })),
  { id: 'a.confidence', label: 'Mean confidence', unit: '%', dp: 0, goodUp: true, kind: 'rate', grain: 'op', scope: 'all', dims: ['plant', 'domain'], base: 84, sd: 1, hsd: 1, lo: 0, hi: 100, th: [70, 55], ai: true,
    live: (pid) => { const a = advs().filter((x) => x.plant === pid && x.status === 'open'); return a.length ? mean(a.map((x) => x.confidence)) : null; },
    icon: 'Gauge', tone: 'accent', route: '/advisory', cta: 'Open AI advisory', def: 'Mean model confidence of open advisories.', source: 'S!aP advisory engine', recs: ['Review low-confidence {top} items with the process head'] },
  { id: 'a.paused', label: 'Models paused', unit: '', dp: 0, goodUp: false, kind: 'sum', grain: 'op', scope: 'all', dims: ['plant'], base: 0, sd: 0.1, hsd: 0.1, lo: 0, th: [1, 2], ai: true,
    live: (pid) => lines(pid).filter((L) => L.paused).length, icon: 'PauseCircle', tone: 'warning', route: '/advisory', cta: 'Open AI advisory',
    def: 'AI models auto-paused because their input data failed data-health gates (confidence under 80%). They resume when completeness returns above 99.5%.', source: 'S!aP data-health gates', recs: ['Restore {top} data health so paused models resume'] },
];

/* ── Records helpers ────────────────────────────────────────────────────── */
function batchRecords(f, pred, view = false) {
  const rows = LAB.lab.batches.filter((b) => (!f.plant || b.plant === f.plant) && (!f.grade || b.grade === f.grade) && b.day < 60)
    .map((b) => (view ? LAB.batchView(b) : { ...b, p28: b.p28 })).filter(pred).slice(0, 60);
  return {
    cols: [{ h: 'Batch' }, { h: 'Grade' }, { h: '3-day', num: true }, { h: '28-day', num: true }, { h: 'Status' }],
    rows: rows.map((b) => ({ cells: [b.id, b.grade, b.s3 ?? '—', b.s28 ?? `${b.p28} (fc)`, b.s28 == null ? 'Forecast' : b.s28 >= BIS[b.grade].s28 ? 'Pass' : 'Fail'], href: `/genealogy?batch=${b.id}` })),
    total: rows.length,
  };
}
function sampleRecords(f) {
  const s = LAB.lab.samples.filter((x) => !f.plant || x.plant === f.plant).sort((a, b) => b.tatMin - a.tatMin).slice(0, 30);
  return { cols: [{ h: 'Barcode' }, { h: 'Instrument' }, { h: 'Stage' }, { h: 'TAT min', num: true }], rows: s.map((x) => ({ cells: [x.barcode, x.instrumentName, x.stage, x.tatMin], href: '/lab' })), total: s.length };
}
function connectorRecords(f) {
  const c = CN.conn.list.filter((x) => !f.plant || x.plant === f.plant).sort((a, b) => a.completeness - b.completeness).slice(0, 30);
  return { cols: [{ h: 'Connector' }, { h: 'Protocol' }, { h: 'State' }, { h: 'Complete %', num: true }], rows: c.map((x) => ({ cells: [x.id, x.protocol, x.state, round(x.completeness, 2)], href: '/connectivity' })), total: c.length };
}
function advisoryRecords(f) {
  const a = advs().filter((x) => (!f.plant || x.plant === f.plant) && x.status === 'open');
  return { cols: [{ h: 'Advisory' }, { h: 'Plant' }, { h: 'Severity' }, { h: '₹ lakh/mo', num: true }], rows: a.map((x) => ({ cells: [x.short || x.title, x.plantName, x.severity, x.impactLakh || '—'], href: '/advisory' })), total: a.length };
}

const byKpi = Object.fromEntries(KPIS.map((k) => [k.id, k]));

module.exports = { KPIS, byKpi, DIMS, PLANT_IDS, INTEG };
