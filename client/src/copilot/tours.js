/*
 * S!a's guided demo of ClinkerIQ, following the strategy brief's storyline:
 * corporate demo (overview → data foundation → quality) then the energy demo.
 * Targets are found by panel title / button text already on the pages.
 */
import { byText, kpiCard, buildFullTour, ifEnabled } from '@astrikos/sia-copilot';

const panel = (title) => () => { const t = byText('.panel-title', title)(); return t ? t.closest('.astk-panel') : null; };
const btn = (text) => byText('button', text);

export const TOURS = {
  overview: {
    title: 'Fleet overview', blurb: 'Six plants, one picture',
    steps: [
      { path: '/', title: 'Six plants, one screen', target: '.map-wrap', optional: true,
        say: 'This is ClinkerIQ for Sagar Cements. All six plants — Mattampally, Dachepalli, Gudipadu, Jeerabad, Bayyavaram and Jajpur — on one live map, coloured by their worst KPI.',
        value: 'One operating picture instead of six plant spreadsheets.' },
      { target: panel('AI Advisory'), title: 'What to deal with first', optional: true,
        say: 'On top, the AI advisory ranks what needs attention across the fleet, and every item shows its evidence. Right now it is flagging an XRF calibration drift at Mattampally and a low-glass slag rake at Jajpur.' },
      { target: kpiCard('Cement output'), click: 'after', title: 'Every number opens up', optional: true,
        say: 'Every KPI card is a door. Let me open cement output.' },
      { target: '.kpi-drawer', title: 'Trend, forecast and breakdown', optional: true, post: (h) => h.escape(),
        say: 'Each drawer shows the trend, a forecast with its 95 percent range, the breakdown by plant, and what the AI recommends — with a branded download.' },
    ],
  },
  connectivity: {
    title: 'Connectivity & data health', blurb: 'Data receipt that survives outages',
    steps: [
      { path: '/connectivity', title: 'The immediate priority', target: 'h1',
        say: 'In the meeting, the immediate priority was to stabilise data receipt — the earlier integration stalled once raw data reached a server. This screen is that fix.' },
      { target: panel('From instrument to model'), title: 'Nothing silently dropped', optional: true,
        say: 'Every record passes an edge gateway at the plant: disk-backed buffering, validation, unit normalisation, and a dead-letter queue. Records lost today: zero.' },
      { target: panel('The broken-pipe test'), title: 'Try to lose data', optional: true,
        say: 'Let me prove it. I will cut the Mattampally WAN link for sixty seconds.',
        post: async (h) => { await h.click(btn('Cut the WAN for 60 s')); await h.wait(1200); } },
      { target: panel('Edge gateways'), title: 'Buffering, then replay', optional: true, hold: 3000,
        say: 'Watch the Mattampally gateway: the uplink is down and the buffer climbs on local disk. When the link returns, it replays in order. Nothing is lost.' },
      { target: panel('Dead-letter queue'), title: 'Held, never dropped', optional: true,
        say: 'Bad rows — a broken oxide total, a free-text sample name, a preliminary calorimeter result — wait here for a person to release or discard. They never reach the models.' },
    ],
  },
  lab: {
    title: 'Lab integration', blurb: 'Seven instrument classes',
    steps: [
      { path: '/lab', target: panel('Instruments'), title: 'Every lab instrument', optional: true,
        say: 'XRF, XRD, particle size, cross-belt, bomb calorimeter, optical microscope and strength testers — each with its protocol path, latest result and calibration drift.' },
      { target: panel('Cross-belt vs lab XRF'), title: 'Catching XRF drift', optional: true,
        say: 'Here the cross-belt analyser disagrees with the lab XRF at Mattampally by more than 0.4 percent CaO. That is the first sign of calibration drift — before it ever reaches the kiln.' },
    ],
  },
  field: {
    title: 'Field & vision', blurb: 'Sensors and cameras',
    steps: [
      { path: '/field', target: panel('Cameras'), title: 'Cameras as data', optional: true,
        say: 'Field instruments and cameras are connected read-only. Cameras send edge-AI features — shell hotspots, flame shape, cooler bed variance, belt tracking — as tags beside the DCS data.' },
    ],
  },
  genealogy: {
    title: 'Material genealogy', blurb: 'One lineage, quarry to cement',
    steps: [
      { path: '/genealogy', target: panel('Lineage of'), title: 'Quarry to cement', optional: true,
        say: 'This joins raw material, process, lab and field data into one lineage: limestone pile, raw meal, kiln feed, clinker, cement batch and its 28-day result, with the residence time at each hop.' },
    ],
  },
  quality: {
    title: 'Quality workbench', blurb: 'Clinker to cement correlation',
    steps: [
      { path: '/quality', target: panel('Clinker alite vs 28-day strength'), title: 'Aligned versus naive', optional: true,
        say: 'Clinker alite against 28-day strength at Mattampally. Joined on residence time, the correlation is strong. Now watch what a naive timestamp join does.',
        during: async (h) => { await h.wait(2500); await h.click(btn('Naive timestamp join')); await h.wait(3000); await h.click(btn('Residence-time aligned')); } },
      { target: panel('Driver matrix'), title: 'What drives strength', optional: true,
        say: 'The driver matrix shows the physics: alite raises strength, free lime and belite lower it, and dense clinker costs mill power.' },
    ],
  },
  prediction: {
    title: 'Predict & optimise', blurb: 'Forecast and specification',
    steps: [
      { path: '/prediction', target: panel('Free-lime soft sensor'), title: 'Free lime every minute', optional: true,
        say: 'The soft sensor estimates free lime every minute between lab results, and forecasts the next 45 minutes. At Mattampally it is above the 1.5 percent limit because of the XRF drift.' },
      { target: panel('Open batches'), title: '28 days early', optional: true,
        say: 'Every batch gets a 28-day strength forecast on the day it is ground, checked against the BIS minimum. At-risk batches are flagged four weeks before the cube is crushed.' },
      { target: panel('What-if'), title: 'Optimise safely', optional: true,
        say: 'And the what-if shows how much more fly ash a grade can take while staying above the release target — with the clinker and rupee saving.' },
    ],
  },
  energy: {
    title: 'Energy scorecard', blurb: 'Targets and mix',
    steps: [
      { path: '/energy', target: panel('Progress to targets'), title: 'FY27 and FY30 targets', optional: true,
        say: 'Now the energy demo. The scorecard tracks Sagar’s own targets — green power, electrical and thermal energy, thermal substitution and CO2 — plant by plant.' },
    ],
  },
  power: {
    title: 'Power automation', blurb: 'The peak-tariff alarm',
    steps: [
      { path: '/power', target: panel('The peak-tariff alarm'), title: 'Ramp in the peak window', optional: true,
        say: 'At Dachepalli the 30 megawatt captive plant is offline, so every extra megawatt lands on the grid. I will ramp the mills inside the peak window.',
        post: async (h) => { await h.click(ifEnabled(btn('Ramp the mills inside the peak window')), { timeout: 1500 }); await h.wait(1500); } },
      { target: panel('15-minute maximum demand'), title: 'Breach forecast with rupees', optional: true, hold: 2500,
        say: 'The 15-minute predictor projects the window against contract demand. As it heads past 95 percent, S!aP prices the penalty under the Andhra tariff and ranks which mill to shed — a person approves it in the AI advisory.' },
      { target: panel('Single-line diagram'), title: 'Live single-line diagram', optional: true,
        say: 'The single-line diagram is fed by IEC 61850 and Modbus meters: incomer, transformer, both buses, the solar tie-in and every feeder.' },
    ],
  },
  dispatch: {
    title: 'ToD & dispatch', blurb: 'Grinding against the tariff',
    steps: [
      { path: '/dispatch', target: panel('24-hour supply plan'), title: 'Move mill hours, save rupees', optional: true,
        say: 'Kilns run all day, but cement mills sit between silos. Moving four mill-hours out of peak into the cheapest slots shows the saving per day and per year, within mill headroom and silo buffer.' },
      { target: panel('Time-of-day tariffs'), title: 'Four state tariffs', optional: true,
        say: 'All four of Sagar’s states are modelled — Telangana, Andhra Pradesh, Madhya Pradesh and Odisha — with their own slots, billing units and penalties.' },
    ],
  },
  efficiency: {
    title: 'Process efficiency', blurb: 'Where the energy goes',
    steps: [
      { path: '/efficiency', target: panel('Kiln heat balance'), title: 'Heat balance', optional: true,
        say: 'The kiln heat balance splits thermal energy into fixed chemistry and controllable losses — exhaust, cooler, shell radiation and false air — so the team knows where the next kilocalorie comes from.' },
    ],
  },
  advisory: {
    title: 'AI advisory', blurb: 'Every recommendation, ranked',
    steps: [
      { path: '/advisory', target: panel('Deal with these first'), title: 'A person decides', optional: true,
        say: 'Every recommendation names its engine, shows its evidence and waits for a person. Apply it, and it is logged to the audit trail.' },
    ],
  },
  platform: {
    title: 'Platform & architecture', blurb: 'Requirement coverage',
    steps: [
      { path: '/platform', target: panel('Requirement coverage'), title: 'Every meeting point covered', optional: true,
        say: 'Every requirement from the November meeting maps to a live screen. S!aP sits above the existing DCS, QCX and SAP — read-only at the OT boundary — and one configured plant becomes the template for the next project.' },
    ],
  },
};

export const TOUR_ORDER = ['overview', 'connectivity', 'lab', 'field', 'genealogy', 'quality', 'prediction', 'energy', 'power', 'dispatch', 'efficiency', 'advisory', 'platform'];

export const FULL_TOUR = buildFullTour({
  tours: TOURS,
  order: TOUR_ORDER,
  title: 'ClinkerIQ guided demo',
  intro: { path: '/', title: 'Welcome', target: 'h1', say: 'Welcome to S!aP ClinkerIQ. I will drive from here. Pause me, step back, jump to a chapter, or just ask a question at any time.' },
  outro: { path: '/', title: 'Summary', target: 'h1', say: 'That is ClinkerIQ: stable lab and plant data, clinker-to-cement quality on true residence time, strength forecast on grinding day, and power cost optimised against four state tariffs. Ask me anything about the plants.' },
});

const KEY_FOR = { '/': 'overview', '/connectivity': 'connectivity', '/lab': 'lab', '/field': 'field', '/genealogy': 'genealogy', '/quality': 'quality', '/prediction': 'prediction', '/energy': 'energy', '/power': 'power', '/dispatch': 'dispatch', '/efficiency': 'efficiency', '/advisory': 'advisory', '/platform': 'platform' };
export function tourKeyForPath(pathname = '/') {
  return KEY_FOR[`/${pathname.split('/')[1] || ''}`] || 'overview';
}

const PROMPTS = {
  full: 'Take control of my screen and give me the full ClinkerIQ demo.',
  overview: 'Walk me through the fleet overview.',
  connectivity: 'Show me how data receipt is stabilised.',
  lab: 'Show me the lab integration.',
  field: 'Show me the field sensors and cameras.',
  genealogy: 'Show me the material genealogy.',
  quality: 'Show me the clinker-to-cement correlation.',
  prediction: 'Show me prediction and optimisation.',
  energy: 'Walk me through the energy scorecard.',
  power: 'Show me the peak-tariff alarm.',
  dispatch: 'Show me the ToD dispatch savings.',
  efficiency: 'Show me process efficiency.',
  advisory: 'Show me the AI advisory.',
  platform: 'Show me the platform and requirement coverage.',
};

export const TOUR_CONFIG = { tours: TOURS, order: TOUR_ORDER, full: FULL_TOUR, keyForPath: tourKeyForPath, prompts: PROMPTS };
