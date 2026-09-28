const sessionKeys = ['token', 'role', 'driverAmbulanceId', 'hospitalId', 'activeMode'];

function readTokenPayload(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

export function getSession() {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  const payload = token ? readTokenPayload(token) : null;
  if (!token || !role || !payload || (payload.exp && payload.exp * 1000 <= Date.now())) {
    clearSession();
    return null;
  }
  return { token, role, ambulanceId: localStorage.getItem('driverAmbulanceId'), hospitalId: localStorage.getItem('hospitalId') };
}

export function saveSession({ token, role, ambulanceId, hospitalId }) {
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
  return token ? { Authorization: `Bearer ${token}` } : {};
}