// AI advisory engine. Two sources, one content model:
//  • scenario advisories — evidence and operator actions from the research
//    scenario library (sim/scenarios.js);
//  • rule advisories — computed every tick from live state (MD, PF, ToD
//    opportunity, strength giveaway, edge outages, dead-letter queue…).
// Every item names its engine, shows its evidence, and waits for a person
// (theme law 12). Applying an action writes the audit trail and, where it is
// physical, feeds back into the simulation.

const { PLANTS, byId } = require('../domain/plants');
const { BIS, SAFETY_MPA, GRADE_BASE } = require('../domain/bis');
const SC = require('./scenarios');
const PR = require('./process');
const LAB = require('./lab');
const CN = require('./connectivity');
const PW = require('./power');
const { logAudit, notify } = require('./store');
const { round, mean } = require('./util');

const SEV_W = { critical: 4, high: 3, medium: 2, low: 1 };
const SEV_TONE = { critical: 'danger', high: 'warning', medium: 'info', low: 'neutral' };
const decisions = {}; // id → { applied:Set<number>, dismissed, by, at }
const effects = { pfFix: {}, todAdopted: {}, solarCleaned: {}, falseAirFix: {} };
let cache = [];
let builtAt = 0;

const fmtL = (v) => `₹${round(v, 1)} lakh`;

function scenarioAdvisories() {
  const out = [];
  for (const s of SC.active) {
    if (s.level < 0.12 && !s.applied.size) continue;
    const d = SC.DEFS[s.key];
    const p = byId[s.plant];
    const id = `ADV-${s.key}-${s.plant}`;
    let evidence = d.evidence.map(([kind, text]) => ({ kind, text }));
    let title = d.title;
    if (s.key === 'E1') {
      const st = PW.power[s.plant];
      const exp = PW.mdExposure(p, st.projected);
      title = `MD forecast ${Math.round(st.projected)}% of contract demand at ${p.name}`;
      evidence = [
        { kind: 'FACT', text: `Live demand ${st.md[st.md.length - 1]}% of ${p.power.cmdKva.toLocaleString('en-IN')} kVA CMD; 15-minute window projected at ${st.projected}%.` },
        { kind: 'FACT', text: `Current ToD slot: ${st.supply.slotLabel} at ₹${st.supply.rate}/${st.supply.unit}; ${p.power.cppOnline ? 'CPP online' : '30 MW CPP non-operational — no captive cover'}.` },
        { kind: 'INFERENCE', text: `${exp.text}. Exposure this billing month ≈ ₹${(exp.rs / 1e5).toFixed(1)} lakh.` },
        { kind: 'RECOMMENDATION', text: 'Ranked shedding: Cement mill 2 (largest shiftable load, silo at 78%) → raw mill feed trim → coal mill.' },
      ];
    }
    out.push({
      id, key: s.key, source: 'scenario', title, short: d.short, domain: d.domain, plant: s.plant, plantName: p.name,
      line: s.line, severity: d.severity, confidence: d.confidence, engine: d.engine, cause: d.cause, evidence,
      actions: d.actions.map(([role, text], i) => ({ id: `${id}-a${i}`, idx: i, role, text, applied: s.applied.has(i) })),
      impactLakh: d.impact, route: d.route, createdAt: new Date(s.startedAt).toISOString(), level: round(s.level, 2),
    });
  }
  return out;
}

function giveaway(plantId, grade) {
  const res = LAB.lab.batches.filter((b) => b.plant === plantId && b.grade === grade && b.s28 != null && b.day >= 28 && b.day <= 58);
  return res.length ? mean(res.map((b) => b.s28)) - (BIS[grade].s28 + SAFETY_MPA) : 0;
}

/** The two plant×grade pairs with the largest monthly clinker saving from giveaway reduction. */
function GIVE_TOP() {
  if (GIVE_TOP.cache && Date.now() - GIVE_TOP.at < 60000) return GIVE_TOP.cache;
  const cands = [];
  for (const p of PLANTS) for (const grade of p.grades.filter((g) => ['PPC', 'PSC', 'CC'].includes(g))) {
    const g = giveaway(p.id, grade);
    if (g > 9) cands.push({ key: `${p.id}-${grade}`, v: p.cementMtpa * p.util * (grade === 'PPC' ? 0.35 : 0.25) });
  }
  GIVE_TOP.cache = cands.sort((x, y) => y.v - x.v).slice(0, 2).map((c) => c.key);
  GIVE_TOP.at = Date.now();
  return GIVE_TOP.cache;
}

function ruleAdvisories() {
  const out = [];
  const now = new Date().toISOString();
  for (const p of PLANTS) {
    const st = PW.power[p.id];
    // Power factor on kVAh-billed plants.
    if (st.pf < 0.976 && p.state !== 'MP' && !effects.pfFix[p.id]) {
      const monthKwh = PW.baseLoadMw(p) * 1000 * 720 * (st.supply.Grid / Math.max(0.1, st.supply.load));
      const loss = (monthKwh * st.supply.rate * (1 / st.pf - 1 / 0.99)) / 1e5;
      out.push({
        id: `ADV-PF-${p.id}`, key: 'PF', source: 'rule', title: `Power factor ${st.pf.toFixed(3)} at ${p.name} — kVAh billing loss`,
        short: 'Low PF on kVAh billing', domain: 'energy', plant: p.id, plantName: p.name, severity: 'medium', confidence: 90,
        engine: 'S!aP power-quality rules', cause: `${p.state === 'AP' ? 'APERC' : 'The tariff'} bills HT industry on kVAh, so every 0.01 PF drop raises unit charges about 1%.`,
        evidence: [
          { kind: 'FACT', text: `Incomer PF ${st.pf.toFixed(3)} lagging; VFD feeders (raw mill, cement mill 2) run 0.96–0.97.` },
          { kind: 'FACT', text: `THD-V ${st.thdV.toFixed(1)}% at the main bus (IEEE 519 HV limit 3%) — capacitor steps de-rated.` },
          { kind: 'INFERENCE', text: `Lifting PF to 0.99 avoids about ${fmtL(loss)} a month in kVAh charges.` },
        ],
        actions: [
          { role: 'Electrical engineer', text: 'Add a detuned 1.2 MVAr APFC step on 6.6 kV bus B and retune the existing steps' },
          { role: 'Electrical engineer', text: 'Install a passive 5th/7th harmonic filter on the cement mill 2 VFD feeder' },
        ],
        impactLakh: round(loss, 1), route: '/power', createdAt: now,
      });
    }
    // ToD grinding shift opportunity.
    if (!effects.todAdopted[p.id]) {
      const d = PW.dispatchDay(p.id, 4);
      if (d.savingsLakhDay > 0.35 && d.peakShareBase > 15) {
        out.push({
          id: `ADV-TOD-${p.id}`, key: 'TOD', source: 'rule', title: `Shift 4 h of finish grinding out of peak at ${p.name}`,
          short: 'ToD grinding shift', domain: 'energy', plant: p.id, plantName: p.name, severity: 'medium', confidence: 84,
          engine: `S!aP merit-order optimiser + ${p.state === 'TG' ? 'TGERC' : p.state === 'AP' ? 'APERC' : p.state === 'MP' ? 'MPERC' : 'OERC'} tariff engine`,
          cause: 'Kilns must run 24×7, but cement mills sit between silos and can move out of peak slots.',
          evidence: [
            { kind: 'FACT', text: `${d.peakShareBase}% of grid energy is drawn in peak slots today.` },
            { kind: 'FACT', text: `Peak-to-cheap spread up to ₹${round(Math.max(...d.rows.map((r) => r.rate)) - Math.min(...d.rows.map((r) => r.rate)), 2)} per unit in ${p.stateName}.` },
            { kind: 'INFERENCE', text: `Moving ${d.movedMwh} MWh/day saves ${fmtL(d.savingsLakhDay)} a day (≈ ₹${d.savingsCrYear} crore a year at 330 days).` },
          ],
          actions: [
            { role: 'Energy manager', text: 'Adopt the ToD grinding schedule for next week and brief the CCR shift in-charges' },
            { role: 'Production planner', text: 'Raise the cement silo target to 85% before 18:00 so dispatch is covered through the peak' },
          ],
          impactLakh: round(d.savingsLakhDay * 30, 1), route: '/dispatch', createdAt: now,
        });
      }
    }
    // Strength giveaway on blended cement (the two largest opportunities only).
    for (const grade of p.grades.filter((g) => ['PPC', 'PSC', 'CC'].includes(g))) {
      const g = giveaway(p.id, grade);
      if (g > 9 && GIVE_TOP().includes(`${p.id}-${grade}`)) {
        const tMonth = ((p.cementMtpa * 1e6 * p.util) / 12) * (grade === 'PPC' ? 0.35 : 0.25);
        const lakh = (tMonth * 0.03 * 3000) / 1e5;
        out.push({
          id: `ADV-GIVE-${p.id}-${grade}`, key: 'GIVE', source: 'rule', title: `${grade} ships +${round(g, 1)} MPa over target at ${p.name}`,
          short: `${grade} strength giveaway`, domain: 'quality', plant: p.id, plantName: p.name, severity: 'low', confidence: 79,
          engine: 'S!aP 28-day strength forecaster v2.0 (gradient boosting)',
          cause: 'Plants carry wide safety margins above BIS floors; a reliable 28-day forecast lets the margin come down safely.',
          evidence: [
            { kind: 'FACT', text: `Mean 28-day ${grade} strength over the last 30 results is ${round(BIS[grade].s28 + SAFETY_MPA + g, 1)} MPa against a ${BIS[grade].s28 + SAFETY_MPA} MPa release target (BIS ${BIS[grade].s28} + 3).` },
            { kind: 'INFERENCE', text: `Forecaster error is about ±0.9 MPa (chronological test), so a 3% higher SCM share keeps every batch above target.` },
            { kind: 'INFERENCE', text: `Saves about ${Math.round(tMonth * 0.03).toLocaleString('en-IN')} t clinker a month ≈ ${fmtL(lakh)}.` },
          ],
          actions: [
            { role: 'Quality manager', text: `Trial ${grade === 'PPC' ? 'fly ash 30% → 33% (IS 1489 cap 35%)' : 'slag +3% within IS 455 limits'} on one mill for 10 days with daily 3-day checks` },
            { role: 'Process engineer', text: 'Hold Blaine at the current target so early strength is protected during the trial' },
          ],
          impactLakh: round(lakh, 1), route: '/prediction', createdAt: now,
        });
      }
    }
    // Solar soiling.
    if (p.power.solarMw >= 1 && st.solarPr < 0.77 && !effects.solarCleaned[p.id]) {
      out.push({
        id: `ADV-PR-${p.id}`, key: 'PR', source: 'rule', title: `Solar performance ratio ${Math.round(st.solarPr * 100)}% at ${p.name}`, short: 'Solar soiling',
        domain: 'energy', plant: p.id, plantName: p.name, severity: 'low', confidence: 76, engine: 'S!aP solar PR model',
        cause: 'Cement dust soils panels faster than the cleaning cycle; PR drops below the 78% normal band.',
        evidence: [
          { kind: 'FACT', text: `PR ${Math.round(st.solarPr * 100)}% vs 80% expected for this irradiance; inverters report no faults.` },
          { kind: 'INFERENCE', text: 'Pattern matches soiling (gradual decline since the last robotic cleaning run), not inverter derating.' },
        ],
        actions: [{ role: 'Electrical maintenance', text: 'Bring forward the robotic panel-cleaning run and re-check PR the next day' }],
        impactLakh: round(p.power.solarMw * 0.19 * 24 * 30 * 0.06 * 6.5 / 100, 1), route: '/dispatch', createdAt: now,
      });
    }
    // Edge outage.
    const g = CN.conn.gateways[p.id];
    if (g.uplink !== 'up') {
      out.push({
        id: `ADV-WAN-${p.id}`, key: 'WAN', source: 'rule', title: `Edge uplink ${g.uplink === 'down' ? 'down' : 'replaying'} at ${p.name} — 0 records lost`,
        short: 'Edge uplink outage', domain: 'data', plant: p.id, plantName: p.name, severity: g.uplink === 'down' ? 'high' : 'medium', confidence: 99,
        engine: 'S!aP data-health monitor', cause: 'The WAN link from the plant edge gateway dropped. Store-and-forward keeps capturing locally and replays in order on reconnect.',
        evidence: [
          { kind: 'FACT', text: `${g.buffer.toLocaleString('en-IN')} records buffered on the gateway disk (${g.diskFreeGb} GB free).` },
          { kind: 'FACT', text: `${g.replayedTotal.toLocaleString('en-IN')} records replayed so far today; ${g.lostTotal} lost.` },
          { kind: 'INFERENCE', text: 'Quality models keep running on the last good data and resume automatically once replay completes.' },
        ],
        actions: [{ role: 'IT network', text: 'Check the plant WAN router and ISP link; no OT action is needed while the buffer holds' }],
        impactLakh: 0, route: '/connectivity', createdAt: now,
      });
    }
  }
  // Dead-letter queue.
  const held = CN.conn.quarantine.filter((q) => q.status === 'quarantined');
  if (held.length) {
    out.push({
      id: 'ADV-DLQ', key: 'DLQ', source: 'rule', title: `${held.length} lab records held in the dead-letter queue`, short: 'Records awaiting review',
      domain: 'data', plant: held[0].plant, plantName: byId[held[0].plant].name, severity: 'low', confidence: 100, engine: 'S!aP validation engine',
      cause: 'Records failing closure, barcode, plausibility, basis or clock rules are held — never silently dropped, never passed to the models.',
      evidence: held.slice(0, 3).map((q) => ({ kind: 'FACT', text: `${q.id} · ${byId[q.plant].name} · ${q.reason}` })),
      actions: [{ role: 'Lab chemist', text: 'Review the held records, correct the source export, and release or discard each one' }],
      impactLakh: 0, route: '/connectivity', createdAt: now,
    });
  }
  return out;
}

function build() {
  const list = [...scenarioAdvisories(), ...ruleAdvisories()].map((a) => {
    const dec = decisions[a.id] || {};
    const actions = a.actions.map((x, i) => ({ id: x.id || `${a.id}-a${i}`, idx: i, ...x, applied: x.applied || !!dec.applied?.has(i) }));
    const allApplied = actions.every((x) => x.applied);
    const status = dec.dismissed ? 'dismissed' : allApplied ? 'applied' : 'open';
    const score = SEV_W[a.severity] * (a.confidence / 100) * (1 + Math.log10(1 + (a.impactLakh || 0)));
    return {
      ...a, actions, status, tone: SEV_TONE[a.severity], score: round(score, 2),
      why: [
        `${a.severity[0].toUpperCase()}${a.severity.slice(1)} severity · ${a.confidence}% confidence`,
        a.impactLakh ? `Estimated impact ${fmtL(a.impactLakh)} a month` : 'Protects data integrity rather than cost',
        `${a.evidence.filter((e) => e.kind === 'FACT').length} measured signals agree`,
      ],
    };
  }).sort((x, y) => (x.status === 'open' ? 0 : 1) - (y.status === 'open' ? 0 : 1) || y.score - x.score);
  cache = list;
  builtAt = Date.now();
  return list;
}

function list() { return Date.now() - builtAt > 2000 ? build() : cache; }

function apply(id, idx, user) {
  const a = list().find((x) => x.id === id);
  if (!a) return null;
  const act = a.actions[idx];
  if (!act) return null;
  decisions[id] = decisions[id] || { applied: new Set() };
  decisions[id].applied.add(idx);
  if (a.source === 'scenario') {
    const s = SC.active.find((x) => x.key === a.key && x.plant === a.plant);
    if (s) s.applied.add(idx);
  } else if (a.key === 'PF') effects.pfFix[a.plant] = true;
  else if (a.key === 'TOD') effects.todAdopted[a.plant] = true;
  else if (a.key === 'PR') { effects.solarCleaned[a.plant] = true; PW.power[a.plant].solarPr = 0.81; }
  logAudit(user, 'Applied AI recommendation', `${a.plantName} · ${act.text}`, { advisory: id });
  notify('verified', 'Recommendation applied', `${act.text} — logged to the audit trail.`, a.route, a.plant);
  build();
  return { advisory: list().find((x) => x.id === id), action: act };
}

function dismiss(id, user) {
  decisions[id] = decisions[id] || { applied: new Set() };
  decisions[id].dismissed = true;
  const a = cache.find((x) => x.id === id);
  logAudit(user, 'Dismissed AI advisory', a ? `${a.plantName} · ${a.title}` : id);
  build();
}

/** Apply effects that persist after a decision (PF correction raises the plant's PF). */
function tickEffects() {
  for (const pid of Object.keys(effects.pfFix)) { const st = PW.power[pid]; st.pf = Math.min(0.992, st.pf + 0.004); }
}

module.exports = { list, build, apply, dismiss, effects, tickEffects, giveaway, SEV_TONE };
