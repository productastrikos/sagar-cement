/*
 * S!a Copilot for ClinkerIQ (vendored @astrikos/sia-copilot 1.0.0-ciq.1).
 * Rule brain + tours drive the demo; anything the rules cannot answer goes to
 * /api/sia/ask, which answers from live ClinkerIQ data with the server-side LLM key.
 */
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { SiaCopilot, useCopilotFacts } from '@astrikos/sia-copilot';
import '@astrikos/sia-copilot/style.css';
import { post } from '../lib/api';
import { useLive } from '../lib/live';
import { TOUR_CONFIG } from './tours';
import { KNOWLEDGE } from './knowledge';
import SiaDock from './SiaDock';

const IDENTITY = { name: 'S!a', spokenName: 'See-ah', title: 'S!a Copilot', product: 'S!aP ClinkerIQ', maker: 'Astrikos' };

const PRONOUNCE = [
  [/S!aP/g, 'Sia P'], [/ClinkerIQ/g, 'Clinker I Q'], [/₹\s?/g, 'rupees '], [/kWh\/t/g, 'kilowatt hours per tonne'], [/kcal\/kg/g, 'kilocalories per kilo'],
  [/\bMPa\b/g, 'megapascals'], [/\bTPD\b/g, 'tonnes per day'], [/\bCMD\b/g, 'contract demand'], [/\bkVAh\b/g, 'K V A H'], [/\bkVA\b/g, 'K V A'],
  [/C₃S/g, 'C 3 S'], [/C₂S/g, 'C 2 S'], [/f-CaO/g, 'free lime'], [/\bDLQ\b/g, 'dead letter queue'], [/\bMTPA\b/g, 'million tonnes a year'], [/\bLSF\b/g, 'L S F'],
];

// Short memory so follow-up questions ("and at Jajpur?") keep their context.
const history = [];

/** KPI cards carry aria-label "Label: value unit. Open details" plus data-kpi-trend / data-kpi-note. */
function readKpi(el, d) {
  if (!el) return `I could not find ${d.kpi.name} on screen just now.`;
  const aria = (el.getAttribute('aria-label') || '').replace(/\.\s*Open details\.?$/, '');
  const i = aria.indexOf(':');
  const label = i > 0 ? aria.slice(0, i).trim() : d.kpi.name;
  const value = i > 0 ? aria.slice(i + 1).trim() : 'on screen';
  const trend = el.getAttribute('data-kpi-trend');
  const note = el.getAttribute('data-kpi-note');
  const lead = d.define ? `${d.define} Right now it is ${value}` : `${label} is ${value}`;
  return `${lead}${trend ? `, ${trend}` : ''}.${note ? ` ${note}.` : ''}`;
}

const SCREEN = {
  kpi: '[data-kpi]',
  pageTitle: '.page-title',
  readKpi,
  adhoc: {
    llm: async (d, where) => {
      try {
        const r = await post('/sia/ask', { q: d.q, path: where.pathname, history: history.slice(-6) });
        history.push({ role: 'user', content: d.q }, { role: 'assistant', content: r.answer });
        if (history.length > 12) history.splice(0, history.length - 12);
        return { say: r.answer };
      } catch {
        return { say: 'I could not reach the ClinkerIQ server just now. Try again in a moment.' };
      }
    },
  },
};

function Facts() {
  const { live } = useLive();
  const counts = live?.advisory?.counts;
  useCopilotFacts(useMemo(() => ({ openAdvisories: counts?.open ?? 0, critical: counts?.critical ?? 0 }), [counts?.open, counts?.critical]));
  return null;
}

export default function PocCopilot({ enabled = true, children }) {
  const navigate = useNavigate();
  return (
    <SiaCopilot enabled={enabled} tours={TOUR_CONFIG} knowledge={KNOWLEDGE} identity={IDENTITY} navigate={navigate}
      pronounce={PRONOUNCE} lang="en-IN" screen={SCREEN}>
      {children}
      <Facts />
      <SiaDock />
    </SiaCopilot>
  );
}
