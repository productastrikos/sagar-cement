// S!a Copilot "ask anything" — answers questions the rule brain cannot, from a
// grounded snapshot of live ClinkerIQ data. The LLM key never leaves the server.
//   LLM_PROVIDER = groq | openai | openrouter   LLM_API_KEY = …   LLM_MODEL (optional)   LLM_BASE_URL (optional)
const express = require('express');
const { PLANTS, byId, FLEET } = require('../domain/plants');
const { BIS } = require('../domain/bis');
const { STATE_TARIFFS } = require('../domain/tariffs');
const I = require('../kpi/insight');
const { KPIS, byKpi } = require('../kpi/registry');
const ADV = require('../sim/advisory');
const SC = require('../sim/scenarios');
const CN = require('../sim/connectivity');
const PW = require('../sim/power');
const LAB = require('../sim/lab');

const router = express.Router();

const PROVIDERS = {
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'openai/gpt-oss-120b' },
  openai: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', model: 'meta-llama/llama-3.3-70b-instruct' },
};

const PAGES = {
  '/': 'Fleet overview', '/advisory': 'AI advisory', '/connectivity': 'Connectivity & data health', '/lab': 'Lab integration', '/field': 'Field & vision',
  '/genealogy': 'Material genealogy', '/quality': 'Quality workbench', '/prediction': 'Predict & optimise', '/energy': 'Energy scorecard',
  '/power': 'Power automation', '/dispatch': 'ToD & dispatch', '/efficiency': 'Process efficiency', '/platform': 'Platform & architecture',
};

const KEY_KPIS = ['o.output', 'e.sec', 'e.shc', 'e.green', 'e.powerCost', 'pw.md', 'pw.pf', 'q.bis28', 'q.fcaoInSpec', 'q.giveaway', 'q.offSpec', 'd.completeness', 'a.open'];

function snapshot(path) {
  const v = (c) => (c ? `${c.value}${c.unit ? ` ${c.unit}` : ''}` : 'n/a');
  const lines = [];
  lines.push(`PRODUCT: S!aP ClinkerIQ by Astrikos — lab-to-plant quality and energy intelligence POC for Sagar Cements Ltd (Hyderabad, est. 1981). All plant data here is SIMULATED for the demo, calibrated to public figures; S!aP reads plant systems read-only and never writes to the DCS.`);
  lines.push(`MEETING (6 Nov 2026) REQUIREMENTS: stabilise lab data receipt; connect XRF, XRD, particle size, cross-belt, bomb calorimeter, optical microscope and strength testers; connect field sensors and cameras; unify raw material, process and field data; correlate clinker parameters with cement quality; predict and optimise against BIS specs; energy management, power automation, renewables.`);
  lines.push(`USER IS ON PAGE: ${PAGES[path] || path || 'unknown'}. PAGES: ${Object.entries(PAGES).map(([p, n]) => `${n} (${p})`).join('; ')}.`);
  lines.push(`FLEET: ${FLEET.cementMtpa} MTPA cement, ${FLEET.clinkerMtpa} MTPA clinker, 4 integrated plants + 2 grinding units. Targets: green power ${FLEET.greenTargetFy27}% FY27 / ${FLEET.greenTargetFy30}% FY30; SEC ${FLEET.secTargetFy27} kWh/t FY27 / ${FLEET.secTargetFy30} FY30; SHC ${FLEET.shcTargetFy30} kcal/kg FY30; TSR ${FLEET.tsrTargetFy27}% FY27.`);
  lines.push('PLANTS:');
  for (const p of PLANTS) {
    const st = PW.power[p.id];
    const per = KEY_KPIS.map((id) => { const c = I.card(id, { plant: p.id }); return c ? `${c.label} ${v(c)} [${c.rag}]` : null; }).filter(Boolean).join('; ');
    lines.push(`- ${p.name} (${p.id}, ${p.type}, ${p.stateName}; ${p.cementMtpa} MTPA; kilns ${p.kilns.map((k) => `${k.name} ${k.tpd} TPD`).join(', ') || 'none'}; power: CPP ${p.power.cppMw} MW${p.power.cppOnline ? '' : ' (non-operational)'}, WHRS ${p.power.whrsMw} MW, solar ${p.power.solarMw} MW, hydro ${p.power.hydroMw} MW; grades ${p.grades.join('/')}). Now: ${per}. ToD slot ${st.supply.slotLabel} at ₹${st.supply.rate}/${st.supply.unit}; projected MD ${st.projected}% of ${p.power.cmdKva} kVA.`);
  }
  lines.push('FLEET KPIs (value [band] — note):');
  for (const k of KPIS) { const c = I.card(k.id); if (c) lines.push(`- ${c.label}: ${v(c)} [${c.rag}] — ${c.foot}. ${byKpi[k.id].def}`); }
  const advs = ADV.list();
  lines.push(`OPEN AI ADVISORIES (${advs.filter((a) => a.status === 'open').length}), ranked:`);
  advs.filter((a) => a.status === 'open').slice(0, 10).forEach((a, i) => {
    lines.push(`${i + 1}. [${a.severity}, ${a.confidence}% conf, ₹${a.impactLakh || 0} lakh/mo] ${a.title} — ${a.plantName}. Engine: ${a.engine}. Evidence: ${a.evidence.slice(0, 3).map((e) => e.text).join(' | ')} Actions: ${a.actions.map((x) => `${x.role}: ${x.text}${x.applied ? ' (applied)' : ''}`).join(' | ')}`);
  });
  const applied = advs.filter((a) => a.status === 'applied').map((a) => `${a.short} at ${a.plantName}`);
  if (applied.length) lines.push(`ALREADY APPLIED: ${applied.join('; ')}.`);
  lines.push(`LIVE SCENARIOS: ${SC.active.map((s) => `${SC.DEFS[s.key].title} at ${byId[s.plant].name} (${Math.round(s.level * 100)}%)`).join('; ') || 'none'}.`);
  const off = CN.conn.list.filter((c) => c.state !== 'online');
  lines.push(`DATA HEALTH: gateways ${Object.values(CN.conn.gateways).map((g) => `${byId[g.plant].name} ${g.uplink} (buffer ${g.buffer}, lost ${g.lostTotal})`).join('; ')}. Connectors not online: ${off.map((c) => `${c.id} ${c.state}`).join(', ') || 'none'}. Dead-letter queue: ${CN.conn.quarantine.filter((q) => q.status === 'quarantined').length} held. Ingested today: ${CN.conn.counters.ingestedToday}.`);
  const tod = PLANTS.map((p) => { const d = PW.dispatchDay(p.id, 4); return `${p.name} ₹${d.savingsLakhDay} lakh/day (peak share ${d.peakShareBase}%)`; });
  lines.push(`TOD OPPORTUNITY (4 mill-hours moved out of peak): ${tod.join('; ')}.`);
  lines.push(`TARIFFS: ${Object.entries(STATE_TARIFFS).map(([s, t]) => `${s} ${t.regulator} billed in ${t.unit}, demand ₹${t.demandPerKva}/kVA, ${t.mdRule}`).join('; ')}.`);
  lines.push(`BIS 28-DAY MINIMUMS: ${Object.entries(BIS).map(([g, s]) => `${g} ${s.s28} MPa (${s.standard})`).join('; ')}.`);
  const risky = LAB.lab.batches.filter((b) => b.day < 28).map(LAB.batchView).filter((b) => b.atRisk).slice(0, 6);
  lines.push(`BATCHES AT 28-DAY RISK: ${risky.map((b) => `${b.id} ${b.grade} forecast ${b.p28} MPa`).join('; ') || 'none'}.`);
  lines.push('KEY STORY: residence-time aligned correlation of clinker alite vs 28-day strength at Mattampally is about r = 0.58 vs about 0.15 with a naive timestamp join. Forecaster MAE about 0.8 MPa on a chronological split. S!aP library: 300+ connectors and 25 pre-built models; this POC uses 8 models adapted to cement.');
  return lines.join('\n');
}

const SYSTEM = `You are S!a (pronounced "See-ah"), the copilot inside S!aP ClinkerIQ by Astrikos, demoed to Sagar Cements.
Answer using ONLY the CONTEXT below. Rules:
- Quote numbers exactly as given, with units and plant names. Never invent figures, plants, dates or vendors.
- If the context does not contain the answer, say so briefly and suggest the page that would show it.
- Your reply is spoken aloud: plain sentences only, no markdown, no bullet symbols, no tables. Keep it under 90 words unless asked for detail.
- Be confident and concrete, like a cement process and energy expert. Lead with the answer.
- If asked whether data is real: it is simulated for the demo, calibrated to Sagar's public figures.
- For "what needs attention / what first / priorities" questions, follow the ranked OPEN AI ADVISORIES order and give the evidence.
- Do not mix up metrics: off-spec % is not pass rate; say which KPI each number belongs to.
- You can recommend actions, but a person decides; S!aP never writes to the DCS.`;

router.post('/sia/ask', async (req, res) => {
  const q = String(req.body?.q || '').slice(0, 600);
  if (!q.trim()) return res.status(400).json({ error: 'Ask a question.' });
  const provider = (process.env.LLM_PROVIDER || 'groq').toLowerCase();
  const key = process.env.LLM_API_KEY;
  const cfg = PROVIDERS[provider] || PROVIDERS.groq;
  if (!key) return res.json({ answer: 'My language model is not configured on this server, so I can only answer from my built-in knowledge. Try asking about a figure or a screen.', engine: 'rules only' });
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-6) : [];
  const messages = [
    { role: 'system', content: `${SYSTEM}\n\nCONTEXT:\n${snapshot(req.body?.path)}` },
    ...history.filter((m) => m && (m.role === 'user' || m.role === 'assistant')).map((m) => ({ role: m.role, content: String(m.content).slice(0, 800) })),
    { role: 'user', content: q },
  ];
  const model = process.env.LLM_MODEL || cfg.model;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(process.env.LLM_BASE_URL || cfg.url, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 700, ...(/gpt-oss/.test(model) ? { reasoning_effort: 'low' } : {}) }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('S!a LLM error', r.status, j?.error?.message || '');
      return res.json({ answer: 'I could not reach my language model just now. Ask me about a figure or a screen and I will read it off the page.', engine: 'fallback' });
    }
    const answer = (j.choices?.[0]?.message?.content || '').replace(/[*#`|]/g, '').replace(/\n{2,}/g, ' ').trim();
    res.json({ answer: answer || 'I do not have that in front of me.', engine: `${process.env.SIA_PROVIDER_LABEL || 'S!a'} · ${model}` });
  } catch (e) {
    res.json({ answer: e.name === 'AbortError' ? 'That took too long to work out. Try asking it a simpler way.' : 'I could not reach my language model just now.', engine: 'fallback' });
  } finally {
    clearTimeout(timer);
  }
});

module.exports = router;
module.exports.snapshot = snapshot;
