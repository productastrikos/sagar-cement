// Audit trail and notification feed — in memory, capped, newest first.

const audit = [];
const notifications = [];
let seq = 3200;

function logAudit(user, action, target, extra = {}) {
  audit.unshift({
    id: `AUD-${++seq}`, ts: new Date().toISOString(),
    user: user?.fullName || 'system', role: user?.roleLabel || 'S!aP engine',
    action, target, ...extra,
  });
  if (audit.length > 400) audit.length = 400;
}

function notify(kind, title, body, route, plant) {
  // Collapse repeats of the same notice within 10 minutes.
  const dupe = notifications.find((n) => n.title === title && Date.now() - n.at < 10 * 60 * 1000);
  if (dupe) return dupe;
  const n = { id: `N-${++seq}`, at: Date.now(), kind, title, body, route, plant, read: false };
  notifications.unshift(n);
  if (notifications.length > 60) notifications.length = 60;
  return n;
}

module.exports = { audit, notifications, logAudit, notify };
