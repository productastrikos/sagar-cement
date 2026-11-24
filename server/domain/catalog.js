// Instruments, connectors, field tags, cameras and electrical feeders.
// Value ranges come from the research Parameter Dictionary and Demo Simulation
// Guide (docs/Indian Cement Quality Data Integration.md). Vendor and DCS names
// are kept generic on purpose: Sagar's actual DCS vendors are not published.

const { PLANTS } = require('./plants');

const INSTRUMENTS = {
  xrf: { id: 'xrf', name: 'XRF spectrometer', short: 'XRF', stages: ['Raw meal', 'Kiln feed', 'Hot meal', 'Clinker', 'Cement'], cadenceMin: 60, protocol: 'File drop (CSV/XML) · QCX OPC', adapter: 'File watcher', example: 'WDXRF (e.g. ARL / Zetium class)' },
  xrd: { id: 'xrd', name: 'XRD diffractometer', short: 'XRD', stages: ['Clinker', 'Cement'], cadenceMin: 120, protocol: 'Rietveld CSV/XML export', adapter: 'File watcher', example: 'Rietveld phase quantification' },
  psa: { id: 'psa', name: 'Particle size & Blaine', short: 'PSA / Blaine', stages: ['Cement', 'Raw meal'], cadenceMin: 120, protocol: 'OPC UA (laser PSD) · manual Blaine', adapter: 'Native OPC UA', example: 'Laser diffraction + Blaine apparatus' },
  cba: { id: 'cba', name: 'Cross-belt analyser', short: 'Cross-belt', stages: ['Limestone'], cadenceMin: 1, protocol: 'OPC UA / Modbus TCP', adapter: 'Native OPC UA', example: 'PGNAA / PFTNA' },
  cal: { id: 'cal', name: 'Bomb calorimeter', short: 'Calorimeter', stages: ['Fuel'], cadenceMin: 240, protocol: 'FTP datalog.csv · RS-232', adapter: 'Serial-to-Ethernet gateway', example: 'Isoperibol bomb calorimeter' },
  mic: { id: 'mic', name: 'Optical microscope', short: 'Microscope', stages: ['Clinker', 'Slag'], cadenceMin: 2880, protocol: 'Image-analysis CSV auto-export', adapter: 'File watcher', example: 'Ono method clinker petrography' },
  ctm: { id: 'ctm', name: 'Compression testing machine', short: 'CTM', stages: ['Cement'], cadenceMin: 1440, protocol: 'RS-232 ASCII · Ethernet', adapter: 'Serial-to-Ethernet gateway', example: '70.6 mm mortar cubes, IS 4031 Pt 6' },
};

const LAB_FOR = {
  integrated: ['xrf', 'xrd', 'psa', 'cba', 'cal', 'mic', 'ctm'],
  grinding: ['xrf', 'psa', 'mic', 'ctm'],
};

/** Non-lab connector templates. */
const SYSTEMS = {
  integrated: [
    { key: 'dcs', cls: 'dcs', name: 'Plant DCS', protocol: 'OPC DA → OPC UA wrapper', adapter: 'DA-to-UA wrapper (local)', tags: 1840 },
    { key: 'hist', cls: 'dcs', name: 'Process historian', protocol: 'OPC HDA / REST', adapter: 'Native', tags: 1840 },
    { key: 'pgnaa', cls: 'field', name: 'Field instruments (gas analysers, weighfeeders)', protocol: 'Modbus TCP / 4–20 mA via PLC', adapter: 'Native Modbus', tags: 260 },
    { key: 'meters', cls: 'power', name: 'Power meters & relays', protocol: 'IEC 61850 / Modbus TCP', adapter: 'Native', tags: 420 },
    { key: 'shell', cls: 'camera', name: 'Kiln shell scanner', protocol: 'OPC UA scalar features', adapter: 'Edge AI', tags: 64 },
    { key: 'flame', cls: 'camera', name: 'Flame & cooler cameras', protocol: 'RTSP → edge-AI features', adapter: 'Edge AI', tags: 24 },
    { key: 'belt', cls: 'camera', name: 'Conveyor belt cameras', protocol: 'RTSP → edge-AI features', adapter: 'Edge AI', tags: 12 },
    { key: 'sap', cls: 'erp', name: 'SAP S/4HANA (QM, PM)', protocol: 'OData (read-only)', adapter: 'Native', tags: 0 },
  ],
  grinding: [
    { key: 'dcs', cls: 'dcs', name: 'Plant DCS / PLC', protocol: 'OPC UA', adapter: 'Native OPC UA', tags: 620 },
    { key: 'meters', cls: 'power', name: 'Power meters', protocol: 'Modbus TCP', adapter: 'Native', tags: 180 },
    { key: 'belt', cls: 'camera', name: 'Conveyor & packer cameras', protocol: 'RTSP → edge-AI features', adapter: 'Edge AI', tags: 10 },
    { key: 'sap', cls: 'erp', name: 'SAP S/4HANA (QM, PM)', protocol: 'OData (read-only)', adapter: 'Native', tags: 0 },
  ],
};

function connectorsFor(plant) {
  const lab = LAB_FOR[plant.type].map((i) => ({
    id: `${plant.id}-${i}`, plant: plant.id, key: i, cls: 'lab', name: INSTRUMENTS[i].name, short: INSTRUMENTS[i].short,
    protocol: INSTRUMENTS[i].protocol, adapter: INSTRUMENTS[i].adapter, cadenceMin: INSTRUMENTS[i].cadenceMin,
  }));
  const sys = SYSTEMS[plant.type].map((s) => ({ id: `${plant.id}-${s.key}`, plant: plant.id, ...s, short: s.name, cadenceMin: s.cls === 'erp' ? 60 : 0.1 }));
  return [...lab, ...sys];
}

const CONNECTORS = PLANTS.flatMap(connectorsFor);

/* ── Field tags (per kiln line for integrated plants) ─────────────────── */
// [code, label, unit, mu, sd, phi, lo, hi, normalLo, normalHi]
const KILN_TAGS = {
  Crusher: [
    ['CR1_TPH', 'Crusher throughput', 'tph', 900, 45, 0.7, 400, 1200, 700, 1100],
    ['PGNAA1_LSF', 'Cross-belt LSF', '%', 95.5, 1.8, 0.75, 88, 105, 93.5, 97.5],
    ['PGNAA1_CAO', 'Cross-belt CaO', '%', 46.0, 1.1, 0.75, 40, 52, 44, 48],
  ],
  'Raw mill': [
    ['RM1_FEED_TPH', 'Raw mill feed', 'tph', 400, 10, 0.8, 250, 450, 380, 420],
    ['RM1_DP_MMWC', 'VRM differential pressure', 'mmwc', 460, 14, 0.8, 380, 550, 440, 480],
    ['RM1_VIB_MMS', 'VRM vibration', 'mm/s', 2.6, 0.35, 0.7, 1, 6, 1.5, 3.5],
  ],
  'CF silo': [
    ['CF1_LVL_PCT', 'CF silo level', '%', 64, 3, 0.9, 40, 90, 50, 75],
    ['CF1_BLWR_BAR', 'Aeration blower pressure', 'bar', 0.68, 0.025, 0.8, 0.5, 0.9, 0.6, 0.75],
  ],
  Preheater: [
    ['PH_C1_TEMP', 'C1 exit gas temperature', '°C', 300, 6, 0.85, 220, 360, 260, 315],
    ['PH_C5_DRFT', 'C5 cone draft', 'mmwc', -380, 12, 0.8, -520, -240, -420, -340],
    ['FALSE_AIR', 'Preheater false air', '%', 6.0, 0.5, 0.9, 3, 14, 3, 8],
  ],
  Calciner: [
    ['CALC_OUT_T', 'Calciner outlet temperature', '°C', 875, 6, 0.85, 830, 920, 860, 890],
    ['HOT_MEAL_CALC', 'Hot meal calcination', '%', 92.5, 0.9, 0.8, 80, 97, 90, 95],
  ],
  Kiln: [
    ['KLN_RPM', 'Kiln speed', 'rpm', 4.0, 0.08, 0.9, 2.5, 4.6, 3.5, 4.5],
    ['KLN_TRQ_PCT', 'Kiln drive torque', '%', 64, 2.5, 0.85, 40, 90, 55, 72],
    ['BZT', 'Burning zone temperature', '°C', 1430, 12, 0.85, 1340, 1500, 1400, 1450],
    ['KI_O2', 'Kiln inlet O₂', '%', 2.1, 0.3, 0.85, 0.5, 4.5, 1.5, 2.5],
    ['KI_CO', 'Kiln inlet CO', '%', 0.010, 0.004, 0.7, 0, 0.2, 0, 0.02],
    ['KI_NOX', 'Kiln inlet NOx', 'ppm', 640, 55, 0.85, 250, 1200, 500, 800],
  ],
  Cooler: [
    ['CLR_SAT_C', 'Secondary air temperature', '°C', 1045, 20, 0.85, 850, 1150, 1000, 1080],
    ['CLR_TAT_C', 'Tertiary air temperature', '°C', 930, 16, 0.85, 780, 1050, 880, 980],
    ['CLR_FC_RATIO', 'Fine-to-coarse pressure ratio', '1:x', 2.6, 0.25, 0.8, 1.2, 6.8, 1.2, 3.5],
    ['CLR_CLK_EXIT', 'Clinker exit temperature', '°C', 98, 5, 0.8, 70, 180, 75, 115],
  ],
  'Coal mill': [
    ['CM_COAL_OUT_T', 'Coal mill outlet temperature', '°C', 70, 2.2, 0.8, 55, 95, 65, 75],
    ['CM_CO_PPM', 'Coal mill bag-filter CO', 'ppm', 40, 7, 0.75, 10, 600, 20, 60],
  ],
};

const MILL_TAGS = [
  ['TPH', 'Mill throughput', 'tph', 180, 7, 0.8, 100, 240, 160, 200],
  ['EXIT_TEMP', 'Mill exit cement temperature', '°C', 110, 3.2, 0.85, 85, 140, 100, 118],
  ['SEP_RPM', 'Separator speed', 'rpm', 820, 15, 0.9, 450, 1150, 700, 950],
  ['SPRAY_LPH', 'Water spray flow', 'l/h', 1800, 70, 0.8, 200, 2200, 1500, 2100],
  ['SEC', 'Mill circuit SEC', 'kWh/t', 25, 0.9, 0.85, 17, 42, 18, 28],
];

const GU_EXTRA = [
  ['SLAG_MOIST', 'Incoming slag moisture', '%', 8, 0.8, 0.85, 4, 16, 5, 10],
  ['SLAG_GLASS', 'Slag glass content', '%', 93, 1.2, 0.9, 75, 98, 88, 97],
];

const PACK_TAGS = [
  ['PK_WT_KG', 'Packed bag net weight', 'kg', 50.15, 0.15, 0.6, 48.5, 51, 50, 50.6],
  ['PK_BAGS_HR', 'Packer output', 'bags/h', 2400, 120, 0.7, 0, 3200, 1800, 3000],
];

const CAMERAS = [
  { key: 'shell', name: 'Kiln shell scanner', feature: 'Max zone temperature vs baseline', unit: '°C', mu: 4, sd: 2.5, normalHi: 10, critHi: 20 },
  { key: 'flame', name: 'Burning-zone flame camera', feature: 'Flame centroid / twist index', unit: 'index', mu: 0.15, sd: 0.04, normalHi: 0.25, critHi: 0.4 },
  { key: 'cooler', name: 'Cooler bed thermal camera', feature: 'Bed thermal variance', unit: '°C σ', mu: 27, sd: 3, normalHi: 35, critHi: 60 },
  { key: 'belt', name: 'Clinker conveyor camera', feature: 'Belt mis-tracking', unit: 'mm', mu: 6, sd: 2, normalHi: 15, critHi: 30 },
];

/** Electrical feeders: share of plant load and VFD flag (for harmonics). */
const FEEDERS_INTEGRATED = [
  { key: 'crusher', name: 'Crusher', share: 0.015, vfd: false, shiftable: true },
  { key: 'rawmill', name: 'Raw mill', share: 0.21, vfd: true, shiftable: true },
  { key: 'coalmill', name: 'Coal mill', share: 0.05, vfd: false, shiftable: true },
  { key: 'phfan', name: 'Kiln / PH fan', share: 0.17, vfd: true, shiftable: false },
  { key: 'cooler', name: 'Cooler fans', share: 0.08, vfd: true, shiftable: false },
  { key: 'cm1', name: 'Cement mill 1', share: 0.2, vfd: false, shiftable: true },
  { key: 'cm2', name: 'Cement mill 2', share: 0.2, vfd: true, shiftable: true },
  { key: 'utilities', name: 'Compressors & utilities', share: 0.075, vfd: false, shiftable: false },
];
const FEEDERS_GRINDING = [
  { key: 'cm1', name: 'Cement mill 1', share: 0.46, vfd: true, shiftable: true },
  { key: 'cm2', name: 'Cement mill 2', share: 0.3, vfd: false, shiftable: true },
  { key: 'dryer', name: 'Hot-gas generator & dryer', share: 0.08, vfd: false, shiftable: true },
  { key: 'packing', name: 'Packing plant', share: 0.06, vfd: false, shiftable: false },
  { key: 'utilities', name: 'Compressors & utilities', share: 0.1, vfd: false, shiftable: false },
];

module.exports = {
  INSTRUMENTS, LAB_FOR, CONNECTORS, connectorsFor, KILN_TAGS, MILL_TAGS, GU_EXTRA, PACK_TAGS, CAMERAS,
  FEEDERS_INTEGRATED, FEEDERS_GRINDING,
};
