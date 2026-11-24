// FY 2026–27 HT industrial tariff structures for Sagar's four states, from the
// strategy brief §2 (TGERC, APERC, MPERC, OERC). Rates are ₹ per billing unit
// (kVAh in TG/AP/OD, kWh in MP). This is a demo tariff engine — a real POC
// reconciles it against six months of DISCOM invoices before trusting it.

const STATE_TARIFFS = {
  TG: {
    regulator: 'TGERC', category: 'HT-I(A) Industry General', unit: 'kVAh', demandPerKva: 500,
    base: { 132: 6.65, 33: 7.15, 11: 7.65 },
    slots(hour) {
      if ((hour >= 6 && hour < 10) || (hour >= 18 && hour < 22)) return { slot: 'peak', delta: 1.5 };
      if (hour >= 10 && hour < 18) return { slot: 'solar', delta: -0.5 };
      return { slot: 'normal', delta: 0 };
    },
    mdRule: 'Above 120% of CMD adds 15% on all monthly energy (20% above 200%)',
    pfRule: 'kVAh billing — every 0.01 PF drop raises unit charges about 1%',
  },
  AP: {
    regulator: 'APERC', category: 'HT Category III(A) Industry', unit: 'kVAh', demandPerKva: 475,
    // Normal-hour rates by voltage; peak and off-peak are absolute rates.
    base: { 132: 5.40, 33: 5.85, 11: 6.30 },
    peakHigh: { 132: 6.90, 33: 7.35, 11: 7.80 }, // 11 kV peak extrapolated (brief gives 132/33 kV) — no plant uses it
    offpeak: { 132: 4.65, 33: 5.10, 11: 5.55 },
    highMonths: [2, 3, 4, 5, 9, 10],
    slots(hour) {
      if ((hour >= 6 && hour < 10) || (hour >= 18 && hour < 22)) return { slot: 'peak' };
      if ((hour >= 10 && hour < 15) || hour < 6) return { slot: 'offpeak' };
      return { slot: 'normal' };
    },
    mdRule: 'Above 120% of CMD bills the excess energy share at 1.5×',
    pfRule: 'kVAh billing — PF must stay within 0.95 lag to 0.95 lead',
  },
  MP: {
    regulator: 'MPERC', category: 'HV-3.1 Industrial (>50% LF)', unit: 'kWh', demandPerKva: 729,
    base: { 132: 6.35, 33: 6.70, 11: 6.79 },
    slots(hour, month) {
      if ((hour >= 6 && hour < 9) || (hour >= 17 && hour < 22)) return { slot: 'peak', factor: 1.2 };
      if (hour >= 9 && hour < 17) return { slot: 'solar', factor: 0.8 };
      if (hour >= 22 || hour < 6) return { slot: 'night', factor: month >= 6 && month <= 9 ? 0.9 : 0.925 };
      return { slot: 'normal', factor: 1 };
    },
    mdRule: '120–130% of CMD bills 1.3× fixed charge; above 130% bills 2×',
    pfRule: 'PF rebate +1% at 0.96 up to +7% at unity; penalty below 0.90 up to 35%',
  },
  OD: {
    regulator: 'OERC', category: 'Large Industry HT (>60% LF)', unit: 'kVAh', demandPerKva: 250,
    base: { 132: 4.70, 33: 4.75, 11: 4.75 },
    slots(hour) {
      if (hour >= 18) return { slot: 'peak', factor: 1.1 };
      if (hour >= 8 && hour < 16) return { slot: 'solar', factor: 0.9 };
      return { slot: 'normal', factor: 1 };
    },
    mdRule: 'Up to 120% of CD is penalty-free in normal and solar hours only if peak is not breached',
    pfRule: 'kVAh billing; EHT rebate ₹0.30/kVAh above 80% load factor',
  },
};

const SLOT_LABEL = { peak: 'Peak', solar: 'Solar', offpeak: 'Off-peak', normal: 'Normal', night: 'Night' };

/** Grid rate for a state, voltage, IST hour and month. */
function rateAt(state, kv, hour, month = 11) {
  const t = STATE_TARIFFS[state];
  const v = t.base[kv] ? kv : 132;
  const s = t.slots(hour, month);
  let rate = t.base[v];
  if (state === 'AP') {
    if (s.slot === 'peak') rate = t.peakHigh[v] - (t.highMonths.includes(month) ? 0 : 0.5);
    else if (s.slot === 'offpeak') rate = t.offpeak[v];
  } else if (s.factor) rate = t.base[v] * s.factor;
  else if (s.delta) rate = t.base[v] + s.delta;
  return { slot: s.slot, slotLabel: SLOT_LABEL[s.slot], rate: Math.round(rate * 1000) / 1000, unit: t.unit };
}

/** 24-hour tariff curve for a plant's state and supply voltage. */
function curve(state, kv, month = 11) {
  return Array.from({ length: 24 }, (_, h) => ({ hour: h, ...rateAt(state, kv, h, month) }));
}

/** Marginal cost of each supply source, ₹/kWh (brief §2, merit-order ranges). */
const SOURCE_COST = { WHRS: 0.8, Solar: 1.6, Hydro: 4.6, CPP: 6.9 };

module.exports = { STATE_TARIFFS, rateAt, curve, SOURCE_COST, SLOT_LABEL };
