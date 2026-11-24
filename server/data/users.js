const bcrypt = require('bcryptjs');

// Demo accounts. Names are fictional; roles follow the people who would use
// ClinkerIQ at Sagar Cements.
const DEMO_PASSWORD = 'Astrikos2026';
const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);

const USERS = [
  { id: 'usr-admin', username: 'admin', email: 'admin@clinkeriq.demo', fullName: 'Arjun Mehta', role: 'plant_admin', roleLabel: 'Group digital lead', passwordHash },
  { id: 'usr-quality', username: 'quality', email: 'quality@clinkeriq.demo', fullName: 'Lakshmi Iyer', role: 'quality_manager', roleLabel: 'Quality manager (lab)', passwordHash },
  { id: 'usr-process', username: 'process', email: 'process@clinkeriq.demo', fullName: 'Ravi Teja', role: 'process_engineer', roleLabel: 'CCR process engineer', passwordHash },
  { id: 'usr-energy', username: 'energy', email: 'energy@clinkeriq.demo', fullName: 'Farhan Siddiqui', role: 'energy_manager', roleLabel: 'Energy & power automation', passwordHash },
];

function findUserByIdentifier(identifier) {
  if (!identifier) return undefined;
  const needle = String(identifier).toLowerCase();
  return USERS.find((u) => u.username.toLowerCase() === needle || u.email.toLowerCase() === needle);
}
const findUserById = (id) => USERS.find((u) => u.id === id);
const verifyPassword = (user, password) => !!user && bcrypt.compareSync(password || '', user.passwordHash);
function toPublicUser(user) {
  if (!user) return null;
  const { passwordHash: _omit, ...pub } = user;
  return pub;
}

module.exports = { USERS, DEMO_PASSWORD, findUserByIdentifier, findUserById, verifyPassword, toPublicUser };
