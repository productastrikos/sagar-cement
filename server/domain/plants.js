// Sagar Cements' six active facilities, as published in the FY2025–26 Integrated
// Report, the Q2 FY27 release and the FY26 BRSR (see docs/Sagar Cements SIAP
// Strategy Brief.md §1). Where the research marks a figure Estimated, the
// `estimated` list names it so the UI can say so. Contract demand (cmdKva) and the
// Dachepalli two-line split are demo assumptions, not published figures.

const PLANTS = [
  {
    id: 'MTP', name: 'Mattampally', state: 'TG', stateName: 'Telangana', district: 'Suryapet',
    type: 'integrated', cementMtpa: 3.0, clinkerMtpa: 2.75, commissioned: 1985,
    kilns: [
      { id: 'K1', name: 'Kiln 1', tpd: 1500, stages: 6 },
      { id: 'K2', name: 'Kiln 2', tpd: 6500, stages: 6 },
    ],
    mills: [{ id: 'CM1', name: 'Cement mill 1', kind: 'Ball mill' }, { id: 'CM2', name: 'Cement mill 2', kind: 'VRPM' }],
    grades: ['OPC 53', 'OPC 43', 'PPC'],
    power: { cppMw: 18, cppOnline: true, whrsMw: 8.8, solarMw: 1.35, hydroMw: 0, gridKv: 132, cmdKva: 8000 }, util: 0.65, secBase: 74, shcBase: 712,
    lab: 'NABL lab · FLSmidth QCX / RoboLab', limestoneMt: 389,
    lat: 16.86, lng: 79.94,
    highlights: ['Flagship site since 1985', '2 kilns · 8,000 TPD', '18 MW CPP · 8.8 MW WHRS · 1.35 MW solar', 'Syngas gasifier trials (Sep 2026)'],
    estimated: ['cmdKva'],
  },
  {
    id: 'DCP', name: 'Dachepalli', state: 'AP', stateName: 'Andhra Pradesh', district: 'Palnadu',
    type: 'integrated', cementMtpa: 3.0, clinkerMtpa: 2.31, commissioned: 2023,
    kilns: [
      { id: 'K1', name: 'Line 1', tpd: 3000, stages: 5 },
      { id: 'K2', name: 'Line 2 (6-stage ILC)', tpd: 4000, stages: 6 },
    ],
    mills: [{ id: 'CM1', name: 'Cement mill 1', kind: 'Ball mill' }, { id: 'CM2', name: 'Cement mill 2', kind: 'VRM' }],
    grades: ['OPC 53', 'PPC'],
    power: { cppMw: 30, cppOnline: false, whrsMw: 0, whrsPlannedMw: 9, solarMw: 6, hydroMw: 0, gridKv: 132, cmdKva: 25000 }, util: 0.72, secBase: 76.5, shcBase: 705,
    lab: 'Plant lab', limestoneMt: 400,
    lat: 16.60, lng: 79.74,
    highlights: ['Acquired via NCLT (Andhra Cements), 2023', 'New 6-stage ILC preheater (Oct 2025)', '30 MW CPP non-operational — grid-heavy', '6 MW bifacial solar · 9 MW WHRS planned'],
    estimated: ['cmdKva', 'kiln split'],
  },
  {
    id: 'GDP', name: 'Gudipadu', state: 'AP', stateName: 'Andhra Pradesh', district: 'Anantapur',
    type: 'integrated', cementMtpa: 1.25, clinkerMtpa: 1.0, commissioned: 2015,
    kilns: [{ id: 'K1', name: 'Kiln 1', tpd: 3000, stages: 5 }],
    mills: [{ id: 'CM1', name: 'Cement mill 1', kind: 'Ball mill' }],
    grades: ['OPC 53', 'PPC'],
    power: { cppMw: 25, cppOnline: true, whrsMw: 4.35, solarMw: 6, hydroMw: 4.3, gridKv: 132, cmdKva: 4000 }, util: 0.66, secBase: 79, shcBase: 728,
    lab: 'Plant lab', limestoneMt: 162,
    lat: 14.91, lng: 78.01,
    highlights: ['Acquired BMM Cements, 2015', '25 MW CPP · 4.35 MW WHRS (2026)', '6 MW solar · 4.3 MW wheeled hydro'],
    estimated: ['cmdKva'],
  },
  {
    id: 'JRB', name: 'Jeerabad', state: 'MP', stateName: 'Madhya Pradesh', district: 'Dhar',
    type: 'integrated', cementMtpa: 1.5, clinkerMtpa: 1.0, commissioned: 2022,
    kilns: [{ id: 'K1', name: 'Kiln 1', tpd: 3000, stages: 5 }],
    mills: [{ id: 'CM1', name: 'Cement mill 1', kind: 'VRM' }, { id: 'CM2', name: 'Cement mill 2', kind: 'Ball mill' }],
    grades: ['PPC', 'OPC 43'],
    power: { cppMw: 0, cppOnline: false, whrsMw: 5.3, solarMw: 0.1, hydroMw: 0, gridKv: 132, cmdKva: 9000 }, util: 0.75, secBase: 73.5, shcBase: 718,
    lab: 'NABL lab · RoboLab', limestoneMt: 79,
    lat: 22.36, lng: 74.98,
    highlights: ['Greenfield plant, 2022', '+0.5 MTPA grinding (Jun 2026)', '5.3 MW WHRS · pneumatic AFR feed', '7 MW solar under evaluation'],
    estimated: ['cmdKva', 'kiln TPD'],
  },
  {
    id: 'BYV', name: 'Bayyavaram', state: 'AP', stateName: 'Andhra Pradesh', district: 'Anakapalli',
    type: 'grinding', cementMtpa: 1.5, clinkerMtpa: 0, commissioned: 2016,
    kilns: [],
    mills: [{ id: 'CM1', name: 'Cement mill 1', kind: 'VRM' }, { id: 'CM2', name: 'Cement mill 2', kind: 'Ball mill' }],
    grades: ['PPC', 'PSC', 'CC'],
    power: { cppMw: 0, cppOnline: false, whrsMw: 0, solarMw: 0.13, hydroMw: 4.0, gridKv: 33, cmdKva: 5000 }, util: 0.6, secBase: 55,
    lab: 'NABL lab', clinkerFrom: 'MTP',
    lat: 17.66, lng: 82.95,
    highlights: ['Grinding unit · 1.5 MTPA', 'CII GreenCo Platinum', '4 MW wheeled hydro'],
    estimated: ['cmdKva', 'clinker source'],
  },
  {
    id: 'JJP', name: 'Jajpur', state: 'OD', stateName: 'Odisha', district: 'Kalinganagar',
    type: 'grinding', cementMtpa: 1.5, clinkerMtpa: 0, commissioned: 2022,
    kilns: [],
    mills: [{ id: 'CM1', name: 'Cement mill 1', kind: 'VRM' }],
    grades: ['PSC', 'PPC', 'CC'],
    power: { cppMw: 0, cppOnline: false, whrsMw: 0, solarMw: 0, hydroMw: 0, gridKv: 33, cmdKva: 6500 }, util: 0.62, secBase: 57,
    lab: 'Plant lab', clinkerFrom: 'DCP',
    lat: 20.95, lng: 86.03,
    highlights: ['Grinding unit · 1.5 MTPA (2022)', '100% grid-reliant', 'Steel-cluster GBFS for PSC'],
    estimated: ['cmdKva', 'clinker source'],
  },
];

const HQ = { name: 'Corporate office, Hyderabad', lat: 17.43, lng: 78.41 };
const byId = Object.fromEntries(PLANTS.map((p) => [p.id, p]));
const INTEGRATED = PLANTS.filter((p) => p.type === 'integrated');

/** Plant weights for fleet roll-ups of rate KPIs (by cement capacity). */
/** Cement output in t/h at the plant's current utilisation. */
const cementTph = (p) => (p.cementMtpa * 1e6 * p.util) / 8760;

function weightOf(plantId) { return byId[plantId]?.cementMtpa || 1; }

const FLEET = {
  cementMtpa: 11.75, clinkerMtpa: 7.16, plants: 6, integrated: 4, grinding: 2,
  captiveMw: 113.33, greenTargetFy27: 24, greenTargetFy30: 50,
  secTargetFy27: 70, secTargetFy30: 65, shcTargetFy30: 700, tsrTargetFy27: 15, tsrTargetFy30: 25,
  co2TargetFy27: 542, powerFuelH1Fy27: 1478,
};

module.exports = { PLANTS, HQ, byId, INTEGRATED, weightOf, cementTph, FLEET };
