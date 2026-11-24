/*
 * What S!a knows about ClinkerIQ. The rule brain answers from this, the tours and the
 * KPI cards on screen; anything else goes to the grounded LLM on our server (rules.data
 * + the `llm` handler in Copilot.js), which answers only from live ClinkerIQ data.
 */
const P = (path, name, short, key, kw, blurb) => ({ path, name, short, key, kw, blurb });

export const KNOWLEDGE = {
  pages: [
    P('/', 'the Fleet overview', 'Overview', 'overview', ['overview', 'dashboard', 'home', 'fleet', 'map', 'main screen'], 'Six plants on one map with the AI advisory on top.'),
    P('/advisory', 'the AI advisory', 'Advisory', 'advisory', ['advisory', 'advisories', 'recommendations', 'ai advisory', 'actions'], 'Every recommendation, ranked, with its evidence.'),
    P('/connectivity', 'Connectivity and data health', 'Connectivity', 'connectivity', ['connectivity', 'data health', 'connectors', 'gateways', 'edge', 'dead letter', 'quarantine', 'pipeline'], 'How lab and plant data reach S!aP without being lost.'),
    P('/lab', 'Lab integration', 'Lab', 'lab', ['lab', 'laboratory', 'instruments', 'xrf', 'xrd', 'samples', 'calorimeter', 'microscope'], 'All seven lab instrument classes, connected.'),
    P('/field', 'Field and vision', 'Field', 'field', ['field', 'vision', 'cameras', 'camera', 'sensors', 'tags', 'kiln shell', 'dcs'], 'Field tags and edge-AI camera features.'),
    P('/genealogy', 'Material genealogy', 'Genealogy', 'genealogy', ['genealogy', 'lineage', 'traceability', 'trace', 'batch', 'unified data'], 'One lineage from limestone pile to cement batch.'),
    P('/quality', 'the Quality workbench', 'Quality', 'quality', ['quality', 'workbench', 'correlation', 'clinker quality', 'free lime page'], 'Clinker parameters correlated with cement strength.'),
    P('/prediction', 'Predict and optimise', 'Prediction', 'prediction', ['prediction', 'predict', 'optimise', 'optimize', 'forecaster', 'what if', 'bis', 'specification'], 'Soft sensor, 28-day forecaster and BIS checks.'),
    P('/energy', 'the Energy scorecard', 'Energy', 'energy', ['energy', 'scorecard', 'green power', 'targets', 'esg'], 'Energy against Sagar’s FY27 and FY30 targets.'),
    P('/power', 'Power automation', 'Power', 'power', ['power', 'power automation', 'maximum demand', 'md', 'single line', 'sld', 'substation'], 'The 15-minute MD predictor and power quality.'),
    P('/dispatch', 'ToD and dispatch', 'Dispatch', 'dispatch', ['dispatch', 'tod', 'time of day', 'tariff', 'tariffs', 'merit order', 'grinding schedule'], 'Merit-order supply and grinding shifts against state tariffs.'),
    P('/efficiency', 'Process efficiency', 'Efficiency', 'efficiency', ['efficiency', 'heat balance', 'false air', 'sectional sec', 'waterfall', 'over grinding'], 'Section-wise SEC, heat balance, false air.'),
    P('/platform', 'Platform and architecture', 'Platform', 'platform', ['platform', 'architecture', 'requirements', 'coverage', 'template', 'connectors library', 'models'], 'How S!aP sits above the existing systems.'),
  ],

  // Read off the KPI cards on screen (label = start of the card's aria-label).
  kpis: [
    { id: 'output', label: 'Cement output', path: '/', name: 'Cement output', kw: ['cement output', 'production', 'output', 'tpd', 'how much cement'] },
    { id: 'util', label: 'Capacity utilisation', path: '/', name: 'Capacity utilisation', kw: ['utilisation', 'utilization', 'capacity'] },
    { id: 'sec', label: 'Electrical SEC', path: '/', name: 'Electrical SEC', kw: ['electrical sec', 'sec', 'specific electrical', 'power per tonne', 'kwh per tonne'] },
    { id: 'shc', label: 'Thermal SHC', path: '/', name: 'Thermal SHC', kw: ['thermal', 'shc', 'heat consumption', 'kcal'] },
    { id: 'green', label: 'Green power share', path: '/', name: 'Green power share', kw: ['green power', 'renewable share', 'green share'] },
    { id: 'pfcost', label: 'Power & fuel cost', path: '/', name: 'Power and fuel cost', kw: ['power and fuel', 'fuel cost', 'cost per tonne'] },
    { id: 'bis', label: '28-day pass rate', path: '/', name: '28-day pass rate', kw: ['pass rate', 'bis pass', '28 day pass', 'strength pass'] },
    { id: 'fcao', label: 'Free lime in spec', path: '/', name: 'Free lime in spec', kw: ['free lime', 'fcao', 'f cao', 'free lime in spec'] },
    { id: 'complete', label: 'Data completeness', path: '/', name: 'Data completeness', kw: ['completeness', 'data completeness', 'data health'] },
    { id: 'open', label: 'Open advisories', path: '/', name: 'Open advisories', kw: ['open advisories', 'how many advisories'] },
    { id: 'md', label: 'Projected MD', path: '/power', name: 'Projected maximum demand', kw: ['projected md', 'maximum demand', 'contract demand', 'md now'] },
    { id: 'pf', label: 'Power factor', path: '/power', name: 'Power factor', kw: ['power factor', 'pf'] },
    { id: 'tod', label: 'ToD savings', path: '/dispatch', name: 'ToD savings', kw: ['tod savings', 'tariff savings', 'savings available'] },
    { id: 'buffer', label: 'Edge buffer depth', path: '/connectivity', name: 'Edge buffer depth', kw: ['buffer', 'edge buffer', 'buffered'] },
    { id: 'mae', label: 'Forecast error', path: '/prediction', name: '28-day forecast error', kw: ['forecast error', 'mae', 'model accuracy', 'how accurate'] },
  ],

  glossary: [
    { id: 'siap', name: 'S!aP', kw: ['siap', 's!ap', 'sap platform', 'what is siap', 'astrikos platform'], def: 'S!aP is the Astrikos platform underneath ClinkerIQ: connect, collect, historize, analyse, visualise and advise. It has more than 300 connectors and 25 pre-built models, and sits above the existing DCS, QCX and SAP without replacing anything.', show: { key: 'platform', title: 'Six layers' } },
    { id: 'lsf', name: 'LSF', kw: ['lsf', 'lime saturation', 'lime saturation factor'], def: 'Lime saturation factor: how much lime the raw mix carries against what the silica, alumina and iron can combine with. Around 95 is the target; too high and the meal becomes hard to burn, so free lime climbs.' },
    { id: 'fcao', name: 'Free lime', kw: ['what is free lime', 'free lime mean'], kpi: 'fcao', def: 'Free lime is lime that did not combine in the kiln. 0.5 to 1.5 percent is the working band. High free lime means under-burnt clinker and weaker cement; very low means fuel wasted on over-burning.', show: { key: 'prediction', title: 'Free-lime soft sensor' } },
    { id: 'c3s', name: 'Alite', kw: ['alite', 'c3s', 'c 3 s'], def: 'Alite, C3S, is the clinker phase that gives cement its 1 to 28 day strength. More alite means stronger cement; 55 to 65 percent is the working band.' },
    { id: 'residence', name: 'Residence-time alignment', kw: ['residence time', 'alignment', 'aligned join', 'naive join', 'process lag'], def: 'A 28-day result arrives a month after the clinker was made. S!aP follows the material — raw meal through the silo, kiln and cement mill — so each result is joined to the process window that actually made it. That is why the correlation jumps from about 0.15 to 0.58.', show: { key: 'quality', title: 'Aligned versus naive' } },
    { id: 'saf', name: 'Store-and-forward', kw: ['store and forward', 'buffering', 'edge gateway', 'no data loss', 'lost data'], def: 'Each plant has an edge gateway that keeps every record on local disk while the WAN is down and replays them in order when it returns. That is what fixes the stalled lab integration: nothing is lost.', show: { key: 'connectivity', title: 'Edge gateways' } },
    { id: 'dlq', name: 'Dead-letter queue', kw: ['dead letter', 'dlq', 'quarantine', 'held records'], def: 'Records that fail validation — oxide totals, barcodes, plausibility, calorimeter basis, clock — are held in a dead-letter queue for a person to release or discard. They never reach the models and are never silently dropped.' },
    { id: 'bis', name: 'BIS specification', kw: ['bis', 'is 269', 'is 1489', 'is 455', 'specification', 'spec limits'], def: 'Every batch is checked against the Bureau of Indian Standards limits: IS 269 for OPC, IS 1489 for PPC and IS 455 for PSC. OPC 53 needs at least 53 megapascals at 28 days; PPC and PSC need 33.' },
    { id: 'giveaway', name: 'Strength giveaway', kw: ['giveaway', 'over design', 'safety margin'], def: 'Giveaway is how far 28-day strength sits above the release target of BIS plus 3 megapascals. Indian plants often ship 5 to 15 megapascals extra. A reliable forecast lets that margin come down safely, saving clinker.' },
    { id: 'md', name: 'Maximum demand', kw: ['what is md', 'maximum demand mean', 'contract demand mean', 'cmd'], kpi: 'md', def: 'Maximum demand is the highest 15-minute average draw from the grid. Above 100 percent of contract demand the excess is billed at twice the demand charge, and above 120 percent Telangana and Andhra add energy surcharges. S!aP projects the window and warns before it happens.', show: { key: 'power', title: '15-minute MD predictor' } },
    { id: 'tod', name: 'Time-of-day tariff', kw: ['tod tariff', 'time of day', 'peak slot', 'off peak'], def: 'Each state prices power by hour. Peak slots cost about 1 to 2.5 rupees more per unit than solar or off-peak hours. Kilns run all day, but cement mills sit between silos, so their hours can move.', show: { key: 'dispatch', title: '24-hour supply plan' } },
    { id: 'kvah', name: 'kVAh billing', kw: ['kvah', 'power factor billing'], def: 'Telangana, Andhra Pradesh and Odisha bill industry on kVAh, so every 0.01 drop in power factor raises the bill by about 1 percent. Madhya Pradesh bills kWh and rebates up to 7 percent at unity power factor.' },
    { id: 'whrs', name: 'WHRS', kw: ['whrs', 'waste heat', 'waste heat recovery'], def: 'Waste heat recovery turns preheater and cooler exhaust into electricity at about 80 paise a unit — the cheapest power Sagar has. Mattampally, Gudipadu and Jeerabad have it; 9 megawatts is planned at Dachepalli.' },
    { id: 'tsr', name: 'TSR', kw: ['tsr', 'thermal substitution', 'afr', 'alternative fuel'], def: 'Thermal substitution rate: the share of kiln heat from alternative fuels and biomass. Sagar was at 2.35 percent in H1 FY27 against a 15 percent FY27 target.' },
    { id: 'redriver', name: 'Red river', kw: ['red river', 'cooler channelling'], def: 'A red river is fine clinker fluidising into a hot stream down one side of the grate cooler. It slows quenching, so alite turns back into belite and strength drops days later. The cooler camera and under-grate pressures flag it 5 to 10 minutes early.' },
  ],

  pitch: 'S!aP ClinkerIQ connects every lab instrument, DCS tag, meter and camera across Sagar’s six plants, read-only. It keeps data receipt stable through outages, correlates clinker with cement strength on true residence time, forecasts 28-day strength on grinding day, and cuts power cost against four state tariffs.',

  chapters: [
    ['full', ['everything', 'whole', 'entire', 'the platform', 'the demo', 'demo', 'tour', 'walkthrough', 'around', 'guided demo', 'full demo']],
    ['overview', ['overview', 'dashboard', 'fleet', 'map']],
    ['connectivity', ['connectivity', 'data health', 'broken pipe', 'wan', 'outage', 'gateway']],
    ['lab', ['lab', 'instruments', 'laboratory']],
    ['field', ['field', 'cameras', 'vision']],
    ['genealogy', ['genealogy', 'lineage', 'traceability']],
    ['quality', ['quality', 'correlation', 'workbench']],
    ['prediction', ['prediction', 'forecast', 'what if', 'optimise']],
    ['energy', ['energy', 'scorecard']],
    ['power', ['power', 'maximum demand', 'peak tariff alarm']],
    ['dispatch', ['dispatch', 'tod', 'tariffs']],
    ['efficiency', ['efficiency', 'heat balance']],
    ['advisory', ['advisory', 'recommendations']],
    ['platform', ['platform', 'architecture', 'requirements']],
  ],

  suggest: {
    overview: ['Which plant needs attention first?', 'What is electrical SEC?', 'Show me around'],
    connectivity: ['What happens if the WAN goes down?', 'What is the dead-letter queue?', 'Walk me through this screen'],
    lab: ['Which lab instruments are connected?', 'Why is the XRF drifting at Mattampally?'],
    quality: ['Why does the join matter?', 'What is free lime?', 'What drives 28-day strength?'],
    prediction: ['Which batches are at risk?', 'How accurate is the forecaster?'],
    power: ['What is the MD exposure at Dachepalli?', 'What is kVAh billing?'],
    dispatch: ['How much can we save at Dachepalli?', 'Compare the four state tariffs'],
    energy: ['How far are we from the FY27 targets?', 'Which plant has the worst SEC?'],
  },

  hello: {
    text: 'Hi, I am S!a. I can take the screen and give the full ClinkerIQ demo, read any figure, open any page, or answer questions about the six plants from live data.',
    examples: ['give me the full demo', 'which plant needs attention first?', 'what is free lime?', 'how much can we save with ToD at Dachepalli?'],
  },
  help: 'I can run the guided demo, read any KPI card, open any screen, explain cement and power terms, and answer questions about the plants, advisories, energy and quality from live ClinkerIQ data.',
  helpChips: ['Give me the full demo', 'Which plant needs attention first?', 'Open power automation'],
  greetChips: ['Give me the full demo', 'What can you do?', 'Which plant needs attention first?'],

  aliases: [
    [/\bclinker ?i ?q\b/g, 'clinkeriq'], [/\bsee ?ah ?p\b|\bsia ?p\b/g, 'siap'], [/\bsee ?ah\b/g, 'sia'], [/\bsagar cement(s)?\b/g, 'sagar'],
    [/\bfree ?line\b/g, 'free lime'], [/\bmatt?am ?pally\b/g, 'mattampally'], [/\bdache ?pally\b|\bdachepalli\b/g, 'dachepalli'], [/\bjeera ?bad\b/g, 'jeerabad'], [/\bjaj ?pur\b/g, 'jajpur'],
    [/\bguddi ?padu\b|\bgudi ?padu\b/g, 'gudipadu'], [/\bbayya ?varam\b/g, 'bayyavaram'], [/\bt o d\b/g, 'tod'], [/\bm d\b/g, 'md'],
  ],
  speech: [[/\bSEC\b/g, 'S E C'], [/\bSHC\b/g, 'S H C'], [/\bXRF\b/g, 'X R F'], [/\bXRD\b/g, 'X R D'], [/\bOPC\b/g, 'O P C'], [/\bPPC\b/g, 'P P C'], [/\bPSC\b/g, 'P S C'], [/\bBIS\b/g, 'B I S']],

  lines: {
    isItReal: 'The plants and their capacities, power assets and tariffs are real public figures. The live values are simulated for this demo, so you can try scenarios safely.',
    miss: ['Let me think about that one.'],
  },

  rules: {
    // Analytical questions go straight to the grounded LLM instead of the narration search.
    data: [({ s, done }) => (/^(why|which|who|where|compare|rank|list|summari[sz]e|explain why|tell me about|give me (a |the )?(summary|brief|status)|what should|what would|what if|recommend|should we|can we|how (much|many) (can|could|do|did|are|is|money|batches|plants)|what('?s| is) (wrong|happening|going on|the status|the issue|the problem|causing))\b/.test(s)
      || /\b(worst|best|highest|lowest|biggest|priorit|root cause|attention first|deal with first)\b/.test(s)
      ? done({ type: 'llm', q: s }) : null)],
  },
};
