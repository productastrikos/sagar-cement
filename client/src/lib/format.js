// Formatting helpers (§16.1): DD MMM YYYY, 24-hour HH:mm, thousands separators.
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

export const fmtTime = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const fmtDate = (iso) => { const d = new Date(iso); return `${pad(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}`; };
export const fmtDay = (iso) => { const d = new Date(iso); return `${d.getDate()} ${MON[d.getMonth()]}`; };
export const fmtDateTime = (iso) => `${fmtDate(iso)} ${fmtTime(iso)}`;
export function fmtAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.round(s)} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return fmtDate(iso);
}
export const num = (v, dp = 0) => (v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp }));
export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export const PLANT_OPTIONS = [
  ['MTP', 'Mattampally'], ['DCP', 'Dachepalli'], ['GDP', 'Gudipadu'], ['JRB', 'Jeerabad'], ['BYV', 'Bayyavaram'], ['JJP', 'Jajpur'],
];
export const PLANT_NAME = Object.fromEntries(PLANT_OPTIONS);
export const INTEGRATED = ['MTP', 'DCP', 'GDP', 'JRB'];
export const PRODUCT = 'S!aP ClinkerIQ';
export const PRODUCT_SLUG = 'SiaP-ClinkerIQ';
