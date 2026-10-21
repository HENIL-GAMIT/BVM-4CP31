const sessionKeys = [
  'token',
  'role',
  'driverAmbulanceId',
  'hospitalId',
  'activeMode',
  'smartdispatch_hospital_token',
  'smartdispatch_driver_token',
  'smartdispatch_admin_token'
];

const roleClaimUri = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

function readTokenPayload(token) {
  try {
    const segments = token.split('.');
    if (segments.length !== 3) return null;
    let payload = segments[1].replace(/-/g, '+').replace(/_/g, '/');
    payload += '='.repeat((4 - payload.length % 4) % 4);
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

function tokenRole(payload) {
  return payload?.role || payload?.[roleClaimUri] || null;
}

function isValidToken(token, expectedRole) {
  const payload = readTokenPayload(token);
  const expiresAt = Number(payload?.exp);
  return Number.isFinite(expiresAt) &&
    expiresAt * 1000 > Date.now() &&
    (!expectedRole || tokenRole(payload) === expectedRole);
}

export function getSession(expectedRole) {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  if (!token || !role || !isValidToken(token, role)) {
    clearSession();
    return null;
  }
  if (expectedRole && role !== expectedRole) return null;

  const ambulanceId = localStorage.getItem('driverAmbulanceId');
  const hospitalId = localStorage.getItem('hospitalId');
  const payload = readTokenPayload(token);
  if ((role === 'Driver' && (!ambulanceId || String(payload.ambulanceId) !== ambulanceId)) ||
      (role === 'Hospital' && (!hospitalId || String(payload.hospitalId) !== hospitalId))) {
    clearSession();
    return null;
  }

  return { token, role, ambulanceId, hospitalId };
}

export function saveSession({ token, role, ambulanceId, hospitalId }) {
  if (!token || !role || !isValidToken(token, role)) {
    throw new Error('The server returned an invalid or expired authentication session.');
  }

  clearSession();
  localStorage.setItem('token', token);
  localStorage.setItem('role', role);
  if (ambulanceId !== undefined) localStorage.setItem('driverAmbulanceId', String(ambulanceId));
  if (hospitalId !== undefined) localStorage.setItem('hospitalId', String(hospitalId));
  localStorage.setItem('activeMode', role === 'Admin' ? 'admin' : role === 'Driver' ? 'driver' : role === 'Hospital' ? 'hospital' : 'user');
}

export function clearSession() {
  sessionKeys.forEach((key) => localStorage.removeItem(key));
}

export function authHeaders(token = localStorage.getItem('token')) {
  return token && isValidToken(token) ? { Authorization: `Bearer ${token}` } : {};
}
